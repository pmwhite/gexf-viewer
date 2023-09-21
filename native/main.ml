[@@@warning "-69-34"]

type nodes =
  { indices : (int, int) Hashtbl.t
  ; height : int array
  ; pos_x : float array
  ; pos_y : float array
  ; vel_x : float array
  ; vel_y : float array
  ; force_x : float array
  ; force_y : float array
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
  ; vel_x = Array.make len 0.0
  ; vel_y = Array.make len 0.0
  ; force_x = Array.make len 0.0
  ; force_y = Array.make len 0.0
  ; inward = Array.make len []
  ; outward = Array.make len []
  ; visited = Array.make len false
  }
;;

let iter_nodes nodes ~f =
  for i = 0 to Array.length nodes.visited - 1 do
    f i
  done
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
  iter_nodes nodes ~f:iter;
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
  iter_nodes nodes ~f:(fun node ->
    if not nodes.visited.(node)
    then (
      nodes.visited.(node) <- true;
      iter node 10000.0));
  Array.fill nodes.visited 0 (Array.length nodes.visited) false
;;

let run_simulation_frame (nodes : nodes) =
  let num_nodes = Array.length nodes.pos_x in
  let denominator = Int.to_float num_nodes in
  let average_x = Array.fold_left ( +. ) 0.0 nodes.pos_x /. denominator in
  let average_y = Array.fold_left ( +. ) 0.0 nodes.pos_y /. denominator in
  iter_nodes nodes ~f:(fun node ->
    (* Pull toward height level *)
    let force_x = 0.0 in
    let force_y =
      ((Int.to_float nodes.height.(node) *. 100.0) -. nodes.pos_y.(node)) /. 100.0
    in
    (* Pull toward center *)
    let force_x = force_x +. ((nodes.pos_x.(node) -. average_x) /. -5000.0) in
    let force_y = force_y +. ((nodes.pos_y.(node) -. average_y) /. -5000.0) in
    (* Edge spring forces *)
    let rec iter force_x force_y others =
      match others with
      | other :: others ->
        let diff_x = nodes.pos_x.(node) -. nodes.pos_x.(other) in
        let diff_y = nodes.pos_y.(node) -. nodes.pos_y.(other) in
        let diff_len = Float.sqrt ((diff_x *. diff_x) +. (diff_y *. diff_y)) in
        let scale = (diff_len -. 100.0) /. diff_len /. 4000.0 in
        let force_x = force_x +. (diff_x *. scale) in
        let force_y = force_y +. (diff_y *. scale) in
        iter force_x force_y others
      | [] -> force_x, force_y
    in
    let force_x, force_y = iter force_x force_y nodes.outward.(node) in
    let force_x, force_y = iter force_x force_y nodes.inward.(node) in
    (* Save forces for later. *)
    nodes.force_x.(node) <- force_x;
    nodes.force_y.(node) <- force_y;
    ());
  ()
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
    for _ = 0 to 1000 do
      run_simulation_frame nodes
    done;
    ())
;;
