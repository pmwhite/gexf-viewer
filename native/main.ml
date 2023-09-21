[@@@warning "-69-34"]

type nodes =
  { indices : (int, int) Hashtbl.t
  ; height : int array
  ; pos_x : float array
  ; pos_y : float array
  ; inward : int list array
  ; outward : int list array
  ; visited : bool array
  }

type edges =
  { from : int array
  ; to_ : int array
  }

let parse_error xml message =
  let line, column = Xmlm.pos xml in
  Printf.eprintf "At %d:%d, %s\n" line column message;
  exit 1
;;

let no_dtd xml =
  match Xmlm.input xml with
  | `Dtd None -> ()
  | `Dtd (Some _) -> parse_error xml "DTD unsupport"
  | _ -> failwith "BUG: This case should never happen."
;;

let open_tag xml name =
  match Xmlm.input xml with
  | `El_start ((_, s), _) when String.equal s name -> ()
  | _ -> parse_error xml (Printf.sprintf "expected start of <%s> element" name)
;;

let find_attribute_opt attributes name =
  List.find_map
    (fun ((_, key), value) -> if String.equal key name then Some value else None)
    attributes
;;

let find_attribute xml attributes name =
  match find_attribute_opt attributes name with
  | Some value -> value
  | None -> parse_error xml (Printf.sprintf "expected attribute '%s'" name)
;;

let find_int_attribute xml attributes name =
  let value = find_attribute xml attributes name in
  match int_of_string_opt value with
  | Some id -> id
  | None -> parse_error xml (Printf.sprintf "attribute '%s' must be an integer" name)
;;

let process_nodes xml : nodes =
  let indices : (int, int) Hashtbl.t = Hashtbl.create 1000000 in
  let rec iter index =
    let continue =
      match Xmlm.input xml with
      | `El_start ((_, "node"), attributes) ->
        let id = find_int_attribute xml attributes "id" in
        Hashtbl.add indices id index;
        true
      | `El_end -> false
      | _ -> parse_error xml "expected start of <node> element or end of <nodes> element"
    in
    if continue
    then (
      let () =
        match Xmlm.input xml with
        | `El_end -> ()
        | _ -> parse_error xml "expected end of <node> element"
      in
      iter (index + 1))
    else index
  in
  let len = iter 0 in
  Printf.printf "Found %d nodes\n" len;
  { indices
  ; height = Array.make len 0
  ; pos_x = Array.make len 0.0
  ; pos_y = Array.make len 0.0
  ; inward = Array.make len []
  ; outward = Array.make len []
  ; visited = Array.make len false
  }
;;

let process_edges xml (nodes : nodes) : edges =
  let from = ref [] in
  let to_ = ref [] in
  let rec iter () =
    let continue =
      match Xmlm.input xml with
      | `El_start ((_, "edge"), attributes) ->
        let source =
          find_int_attribute xml attributes "source" |> Hashtbl.find nodes.indices
        in
        let target =
          find_int_attribute xml attributes "target" |> Hashtbl.find nodes.indices
        in
        from := source :: !from;
        to_ := target :: !to_;
        nodes.outward.(source) <- target :: nodes.outward.(source);
        nodes.inward.(target) <- source :: nodes.inward.(target);
        true
      | `El_end -> false
      | _ -> parse_error xml "expected start of <node> element or end of <nodes> element"
    in
    if continue
    then (
      let () =
        match Xmlm.input xml with
        | `El_end -> ()
        | _ -> parse_error xml "expected end of <node> element"
      in
      iter ())
  in
  iter ();
  let from = Array.of_list !from in
  let to_ = Array.of_list !to_ in
  Printf.printf "Found %d edges\n" (Array.length from);
  { from; to_ }
;;

let compute_heights (nodes : nodes) =
  let rec iter node =
    if not nodes.visited.(node)
    then (
      nodes.visited.(node) <- true;
      let max = ref (-1) in
      List.iter
        (fun other ->
          iter other;
          if nodes.height.(other) > !max then max := nodes.height.(other))
        nodes.outward.(node))
  in
  Array.iteri (fun i _ -> iter i) nodes.height;
  Array.fill nodes.visited 0 (Array.length nodes.visited) false
;;

let position_near_parent (nodes : nodes) =
  let rec iter node scale =
    List.iteri
      (fun i child ->
        if not nodes.visited.(child)
        then (
          nodes.visited.(child) <- true;
          nodes.pos_x.(child) <- nodes.pos_x.(node) +. (Int.to_float i *. scale);
          nodes.pos_y.(child) <- nodes.pos_y.(node) +. 1000.0;
          iter node (scale /. 2.0)))
      nodes.outward.(node)
  in
  Array.iteri
    (fun node _ ->
      if not nodes.visited.(node)
      then (
        nodes.visited.(node) <- true;
        iter node 10000.0))
    nodes.pos_x;
  Array.fill nodes.visited 0 (Array.length nodes.visited) false
;;

let () =
  let args = Sys.argv in
  if Array.length args <> 2
  then (
    Printf.eprintf "Usage: main.exe <filename>\n";
    exit 1);
  let filename = args.(1) in
  In_channel.with_open_text filename (fun ic ->
    let xml = Xmlm.make_input ~strip:true (`Channel ic) in
    no_dtd xml;
    open_tag xml "gexf";
    open_tag xml "graph";
    open_tag xml "nodes";
    let nodes = process_nodes xml in
    open_tag xml "edges";
    let _edges = process_edges xml nodes in
    compute_heights nodes;
    position_near_parent nodes;
    ())
;;
