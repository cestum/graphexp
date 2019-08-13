/*
Copyright 2017 Benjamin RICAUD

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Interface between the visualization and the Gremlin server.

var traversal_source = getUrlParameter('ts');
if (traversal_source == null) {
    traversal_source = "g"
}

var graphioGremlin = (function(){
	"use strict";

	var _node_properties = [];
	var _edge_properties = [];


	function get_node_properties(){
		return _node_properties;
	}
	function get_edge_properties(){
		return _edge_properties;
	}

		function create_single_command(query){
			var equalIndex = query.indexOf("=");
			var semiColonIndex = query.indexOf(";");
			if( equalIndex >= 0){
				if(semiColonIndex < 0){
					query = query.substring(equalIndex+1);
				} else {
					query = query.substring(equalIndex+1,semiColonIndex);
				}
			}
			var returnQuery = query.trim();
//                        if(returnQuery.endsWith(".toList();")){
//                            returnQuery = returnQuery+".toList();";
//                        }
			return returnQuery;
		}

	function get_graph_info(){
		var gremlin_query_nodes = "nodes = " + traversal_source + ".V().groupCount().by(label);"
		var gremlin_query_edges = "edges = " + traversal_source + ".E().groupCount().by(label);"
		var gremlin_query_nodes_prop = "nodesprop = " + traversal_source + ".V().valueMap().select(keys).groupCount();"
		var gremlin_query_edges_prop = "edgesprop = " + traversal_source + ".E().valueMap().select(keys).groupCount();"

		var gremlin_query = gremlin_query_nodes+gremlin_query_nodes_prop
			+gremlin_query_edges+gremlin_query_edges_prop
			+ "[nodes.toList(),nodesprop.toList(),edges.toList(),edgesprop.toList()]"
		// while busy, show we're doing something in the messageArea.
		console.log("get_graph_info");
		$('#messageArea').html('<h3>(loading)</h3>');
		var message = ""
				if(SINGLE_COMMANDS_AND_NO_VARS){
					var node_label_query = create_single_command(gremlin_query_nodes);
					var edge_label_query = create_single_command(gremlin_query_edges);
					var node_prop_query = create_single_command(gremlin_query_nodes_prop);
					var edge_prop_query = create_single_command(gremlin_query_edges_prop);
					send_to_server(node_label_query, null, null, null, function(nodeLabels){
					   send_to_server(edge_label_query, null, null, null, function(edgeLabels){
						   send_to_server(node_prop_query, null, null, null, function(nodeProps){
							   send_to_server(edge_prop_query, null, null, null, function(edgeProps){
								   var combinedData = [nodeLabels, nodeProps, edgeLabels, edgeProps];
								   console.log("Combined data", combinedData);
								   handle_server_answer(combinedData,'graphInfo',null,message);
							   });
						   });
					   });
					});
				} else {
					send_to_server(gremlin_query,'graphInfo',null,message)
				}
	}

	function inspect_field() {
		var query = traversal_source + ".V().has('name', '" + $('#fieldName').val() + "').repeat(_in()).until(hasLabel('LOGIC')).in('HAS').path().unfold()";
		var edge_query = query + ".aggregate('node').outE().as('edge').inV().where(within('node')).select('edge')";
		var gremlin_query = query + edge_query;
		var message = '';
		if (SINGLE_COMMANDS_AND_NO_VARS) {
			var nodeQuery = create_single_command(query);
			var edgeQuery = create_single_command(edge_query);
			console.log("Node query: "+nodeQuery);
			console.log("Edge query: "+edgeQuery);
			send_to_server(nodeQuery, null, null, null, function(nodeData){
				send_to_server(edgeQuery, null, null, null, function(edgeData){
					var combinedData = [nodeData,edgeData];
					handle_server_answer(combinedData, 'search', null, message);
				});
			});
		} else {
			send_to_server(gremlin_query,'search',null,message);
		}
	}

	function inspect_logic() {
		var node_queries = [];
		var edge_queries = [];
		if ($('#assignmentNode1').val().length > 0 && $('#assignmentNode2').val().length > 0) {
			compare_assignments();
		} else {
			if ($('#assignmentCheck')[0].checked && $('#conditionalCheck')[0].checked) {
				var logic_query = traversal_source + ".V().hasLabel('LOGIC').out().has('name','assignment').in().hasLabel('LOGIC').out().hasLabel('CONDITIONAL').in()";
				node_queries.push(logic_query + ".path().unfold()"); // logic, assignment, and conditional nodes
				node_queries.push(logic_query + ".out().hasLabel('CONDITIONAL').out()"); //if/else nodes
				edge_queries.push(logic_query + ".out().has('name','assignment').inE('HAS')"); // logic->assignment edges
				edge_queries.push(logic_query + ".out().hasLabel('CONDITIONAL').inE('HAS')"); // logic->conditional edges
				edge_queries.push(logic_query + ".out().hasLabel('CONDITIONAL').outE()"); // conditional->if/else edges
			} else if ($('#assignmentCheck')[0].checked) {
				var assignment_query = traversal_source + ".V().hasLabel('LOGIC').out().has('name','assignment')";
				node_queries.push(assignment_query + ".out().path().unfold()"); // logic, assignment, and lhs/rhs nodes
				edge_queries.push(assignment_query + ".inE('HAS')"); // logic->assignment edges
				edge_queries.push(assignment_query + ".outE()"); // assignment->lhs/rhs edges
			} else if ($('#conditionalCheck')[0].checked) {
				var conditional_query = traversal_source + ".V().hasLabel('LOGIC').out().hasLabel('CONDITIONAL')";
				node_queries.push(conditional_query + ".out().path().unfold()"); //logic, conditional, and if/else nodes
				edge_queries.push(conditional_query + ".inE('HAS')"); //logic->conditional edges
				edge_queries.push(traversal_source + ".V().hasLabel('CONDITIONAL').outE()"); //conditional->if/else edges
			}
			run_inspect_queries(node_queries, edge_queries);
		}
	}

	function compare_assignments() {
		var node1ID = $('#assignmentNode1').val();
		var node2ID = $('#assignmentNode2').val();
		var node1_rhs_query = traversal_source + ".V('" + node1ID + "').outE('RHS').inV().values('name')";
		var node2_rhs_query = traversal_source + ".V('" + node2ID + "').outE('RHS').inV().values('name')";
		var node1_lhs_query = traversal_source + ".V('" + node1ID + "').outE('LHS').inV().values('name')";
		var node2_lhs_query = traversal_source + ".V('" + node2ID + "').outE('LHS').inV().values('name')";
		send_to_server(node1_rhs_query, null, null, null, function (rhs1) {
			var node1_rhs = rhs1["@value"][0];
			send_to_server(node2_rhs_query, null, null, null, function(rhs2) {
				var node2_rhs = rhs2["@value"][0];
				send_to_server(node1_lhs_query, null, null, null, function(lhs1) {
					var node1_lhs = lhs1["@value"][0];
					send_to_server(node2_lhs_query, null, null, null, function(lhs2) {
						var node2_lhs = lhs2["@value"][0];
						if (node1_lhs==node2_lhs && node1_rhs==node2_rhs) {
							// identical assignment
							var node_queries = [];
							node_queries.push(traversal_source + ".V().hasLabel('LOGIC').out().has(id, '" + node1ID + "').out().path().unfold()");
							node_queries.push(traversal_source + ".V().hasLabel('LOGIC').out().has(id, '" + node2ID + "').out().path().unfold()"); 
							var edge_queries = [];
							edge_queries.push(traversal_source + ".V().hasLabel('LOGIC').out().has(id, '" + node1ID + "').inE('HAS')");
							edge_queries.push(traversal_source + ".V().hasLabel('LOGIC').out().has(id, '" + node2ID + "').inE('HAS')");
							edge_queries.push(traversal_source + ".V('" + node1ID + "').outE()");
							edge_queries.push(traversal_source + ".V('" + node2ID + "').outE()");
							run_inspect_queries(node_queries, edge_queries);
						} else if (node1_rhs==node2_rhs || node1_lhs==node2_lhs) {
							// only one side is the same
							var side = "LHS";
							if (node1_rhs==node2_rhs) {
								side = "RHS";
							}
							var node_queries = [];
							node_queries.push(traversal_source + ".V().hasLabel('LOGIC').out().has(id, '" + node1ID + "').out('" + side + "').path().unfold()");
							node_queries.push(traversal_source + ".V().hasLabel('LOGIC').out().has(id, '" + node2ID + "').out('" + side + "').path().unfold()"); 
							var edge_queries = [];
							edge_queries.push(traversal_source + ".V().hasLabel('LOGIC').out().has(id, '" + node1ID + "').inE('HAS')");
							edge_queries.push(traversal_source + ".V().hasLabel('LOGIC').out().has(id, '" + node2ID + "').inE('HAS')");
							edge_queries.push(traversal_source + ".V('" + node1ID + "').outE('" + side + "')");
							edge_queries.push(traversal_source + ".V('" + node2ID + "').outE('" + side + "')");
							run_inspect_queries(node_queries, edge_queries);
						} else {
							$('#messageArea').html('');
							$('#outputArea').html('<h2>No similarity between assignments</h2>');
						}
					});
				});
			});
		});
	}

	function run_inspect_queries(node_queries, edge_queries) {
		let gremlin_query_nodes = node_queries[0];
		let gremlin_query_edges = edge_queries[0];
		var message = ""
		let gremlin_query = gremlin_query_nodes+gremlin_query_edges+"[nodes, edges]";
		// while busy, show we're doing something in the messageArea.
		console.log("run_inspect_queries");
		$('#messageArea').html('<h3>(loading)</h3>');
		if (SINGLE_COMMANDS_AND_NO_VARS) {
			var nodeQuery = create_single_command(gremlin_query_nodes);
			var edgeQuery = create_single_command(gremlin_query_edges);
			var combinedData = [];
			for (var i = 1; i < node_queries.length; i++) {
				var node_query = create_single_command(node_queries[i]);
				send_to_server(node_query, null, null, null, function (data) {combinedData.push(data)});
			}
			for (var i = 1; i < edge_queries.length; i++) {
				var edge_query = create_single_command(edge_queries[i]);
				send_to_server(edge_query, null, null, null, function (data) {combinedData.push(data)});
			}
			send_to_server(nodeQuery, null, null, null, function(nodeData) {
				send_to_server(edgeQuery, null, null, null, function(edgeData) {
					combinedData.push(edgeData);
					combinedData.push(nodeData);
					console.log(combinedData);
					handle_server_answer(combinedData, 'search', null, message);
				});
			});
		} else {
			send_to_server(gremlin_query,'search',null,message);
		}
	}


	function search_query() {
		// Preprocess query
		let input_string = $('#search_value').val();
		let input_field = $('#search_field').val();
		let label_field = $('#label_field').val();
		let limit_field = $('#limit_field').val();
		let search_type = $('#search_type').val();
		//console.log(input_field)
		var filtered_string = input_string;//You may add .replace(/\W+/g, ''); to refuse any character not in the alphabet
		if (filtered_string.length>50) filtered_string = filtered_string.substring(0,50); // limit string length
		// Translate to Gremlin query
		let has_str = "";
		if (label_field !== "") {
			has_str = ".hasLabel('" + label_field + "')";
		}
		if (input_field !== "" && input_string !== "") {
			has_str += ".has('" + input_field + "',";
			switch (search_type) {
				case "eq":
					if (isInt(input_string)){
						has_str += filtered_string + ")"
					} else {
						has_str += "'" + filtered_string + "')"
					}
					break;
				case "contains":
					has_str += "textContains('" + filtered_string + "'))";
					break;
			}
		} else if (limit_field === "" || limit_field < 0) {
				limit_field = node_limit_per_request;
		}

		let gremlin_query_nodes = "nodes = " + traversal_source + ".V()" + has_str;
		if (limit_field !== "" && isInt(limit_field) && limit_field > 0) {
			gremlin_query_nodes += ".limit(" + limit_field + ").toList();";
		} else {
			gremlin_query_nodes += ".toList();";
		}
		let gremlin_query_edges = "edges = " + traversal_source + ".V(nodes).aggregate('node').outE().as('edge').inV().where(within('node')).select('edge').toList();";
        let gremlin_query_edges_no_vars = "edges = " + traversal_source + ".V()"+has_str+".aggregate('node').outE().as('edge').inV().where(within('node')).select('edge').toList();";
                //let gremlin_query_edges_no_vars = "edges = " + traversal_source + ".V()"+has_str+".bothE();";
		let gremlin_query = gremlin_query_nodes + gremlin_query_edges + "[nodes,edges]";
		console.log(gremlin_query);

		// while busy, show we're doing something in the messageArea.
		console.log("search_query");
		$('#messageArea').html('<h3>(loading)</h3>');
		// To display the queries in the message area:
		// var message_nodes = "<p>Node query: '"+gremlin_query_nodes+"'</p>";
		// var message_edges = "<p>Edge query: '"+gremlin_query_edges+"'</p>";
		// var message = message_nodes + message_edges;
		var message = "";
		if (SINGLE_COMMANDS_AND_NO_VARS) {
			var nodeQuery = create_single_command(gremlin_query_nodes);
			var edgeQuery = create_single_command(gremlin_query_edges_no_vars);
			console.log("Node query: "+nodeQuery);
			console.log("Edge query: "+edgeQuery);
			send_to_server(nodeQuery, null, null, null, function(nodeData){
				send_to_server(edgeQuery, null, null, null, function(edgeData){
					var combinedData = [nodeData,edgeData];
					handle_server_answer(combinedData, 'search', null, message);
				});
			});
		} else {
			send_to_server(gremlin_query,'search',null,message);
		}
	}

	function load_graph(){
		let gremlin_query_nodes = traversal_source + ".V()";
		let gremlin_query_edges = traversal_source + ".E()";

		let gremlin_query = gremlin_query_nodes+gremlin_query_edges+"[nodes, edges]";
		// while busy, show we're doing something in the messageArea.
		console.log("load_graph");
		$('#messageArea').html('<h3>(loading)</h3>');
		var message = ""
		if (SINGLE_COMMANDS_AND_NO_VARS) {
			var nodeQuery = create_single_command(gremlin_query_nodes);
			var edgeQuery = create_single_command(gremlin_query_edges);
			console.log("Node query: "+nodeQuery);
			console.log("Edge query: "+edgeQuery);
			send_to_server(nodeQuery, null, null, null, function(nodeData){
				send_to_server(edgeQuery, null, null, null, function(edgeData){
					var combinedData = [nodeData,edgeData];
					handle_server_answer(combinedData, 'search', null, message);
				});
			});
		} else {
			send_to_server(gremlin_query,'search',null,message);
		}
	}

	function run_user_query() {
		let node_input = $('#user_node_query').val();
		let edge_input = $('#user_edge_query').val();
		if (node_input || edge_input) {
			if (!node_input) {
				edge_input_only(edge_input);
			} else {
				var gremlin_query_edges = edge_input;
				if (!edge_input)
					gremlin_query_edges = node_input + ".aggregate('node').outE().as('edge').inV().where(within('node')).select('edge').toList();";
				var gremlin_query = node_input+gremlin_query_edges+"[nodes, edges]";
				// while busy, show we're doing something in the messageArea.
				console.log("run_user_query");
				$('#messageArea').html('<h3>(loading)</h3>');
				var message = "";
				if (SINGLE_COMMANDS_AND_NO_VARS) {
					var nodeQuery = create_single_command(node_input);
					var edgeQuery = create_single_command(gremlin_query_edges);
					console.log("Node query: "+nodeQuery);
					console.log("Edge query: "+edgeQuery);
					send_to_server(nodeQuery, null, null, null, function(nodeData){
						send_to_server(edgeQuery, null, null, null, function(edgeData){
							var combinedData = [nodeData,edgeData];
							handle_server_answer(combinedData,'search', null, message);
						});
					});
				} else {
					send_to_server(gremlin_query,'search',null,message);
				}
			}
			
		}
	}

	function edge_input_only(edge_input) {
		var gremlin_query_in_nodes = edge_input + ".inV()";
		var gremlin_query_out_nodes = edge_input + ".outV()";
		var gremlin_query = gremlin_query_in_nodes+gremlin_query_out_nodes+edge_input+"[nodes, edges]";
		// while busy, show we're doing something in the messageArea.
		console.log("edge_input_only");
		$('#messageArea').html('<h3>(loading)</h3>');
		var message = "";
		if (SINGLE_COMMANDS_AND_NO_VARS) {
			var inNodeQuery = create_single_command(gremlin_query_in_nodes);
			var outNodeQuery = create_single_command(gremlin_query_out_nodes);
			var edgeQuery = create_single_command(edge_input);
			console.log("Node queries: "+ inNodeQuery + "; " + outNodeQuery);
			console.log("Edge query: "+ edgeQuery);
			send_to_server(inNodeQuery, null, null, null, function(inNodeData) {
				send_to_server(outNodeQuery, null, null, null, function(outNodeData) {
					send_to_server(edgeQuery, null, null, null, function(edgeData) {
						var combinedData = [inNodeData,outNodeData,edgeData];
						handle_server_answer(combinedData,'search', null, message);
					});
				});
			});
		} else {
			send_to_server(gremlin_query,'search',null,message);
		}
	}

	function isInt(value) {
	  return !isNaN(value) &&
			 parseInt(Number(value)) == value &&
			 !isNaN(parseInt(value, 10));
	}
	function click_query(d) {
		var edge_filter = $('#edge_filter').val();
		// Gremlin query
		//var gremlin_query = traversal_source + ".V("+d.id+").bothE().bothV().path()"
		// 'inject' is necessary in case of an isolated node ('both' would lead to an empty answer)
		var id = d.id;
		if(isNaN(id)){ // Add quotes if id is a string (not a number).
			id = '"'+id+'"';
		}
		var gremlin_query_nodes = 'nodes = ' + traversal_source + '.V('+id+').as("node").both('+(edge_filter?'"'+edge_filter+'"':'')+').as("node").select(all,"node").inject(' + traversal_source + '.V('+id+')).unfold()'
		var gremlin_query_edges = "edges = " + traversal_source + ".V("+id+").bothE("+(edge_filter?"'"+edge_filter+"'":"")+")";
		var gremlin_query = gremlin_query_nodes+'\n'+gremlin_query_edges+'\n'+'[nodes.toList(),edges.toList()]'
		// while busy, show we're doing something in the messageArea.
		console.log("click_query");
		$('#messageArea').html('<h3>(loading)</h3>');
		var message = "<p>Query ID: "+ d.id +"</p>"
				if(SINGLE_COMMANDS_AND_NO_VARS){
					var nodeQuery = create_single_command(gremlin_query_nodes);
					var edgeQuery = create_single_command(gremlin_query_edges);
					send_to_server(nodeQuery, null, null, null, function(nodeData){
						send_to_server(edgeQuery, null, null, null, function(edgeData){
							var combinedData = [nodeData,edgeData];
							handle_server_answer(combinedData, 'click', d.id, message);
						});
					});
				} else {
					send_to_server(gremlin_query,'click',d.id,message);
				}
	}

	function send_to_server(gremlin_query,query_type,active_node,message, callback){

		let server_address = $('#server_address').val();
		let server_port = $('#server_port').val();
		let COMMUNICATION_PROTOCOL = $('#server_protocol').val();
			if (COMMUNICATION_PROTOCOL == 'REST'){
				let server_url = "http://"+server_address+":"+server_port;
				run_ajax_request(gremlin_query,server_url,query_type,active_node,message,callback);
			}
			else if (COMMUNICATION_PROTOCOL == 'websocket'){
				let server_url = "ws://"+server_address+":"+server_port+"/gremlin"
				run_websocket_request(gremlin_query,server_url,query_type,active_node,message,callback);
			}
			else {
				console.log('Bad communication protocol. Check configuration file. Accept "REST" or "websocket" .')
			}
				
	}

	/////////////////////////////////////////////////////////////////////////////////////////////////
	// AJAX request for the REST API
	////////////////////////////////////////////////////////////////////////////////////////////////
	function run_ajax_request(gremlin_query,server_url,query_type,active_node,message, callback){
		// while busy, show we're doing something in the messageArea.
		console.log("run_ajax_request");
		$('#messageArea').html('<h3>(loading)</h3>');

		// Get the data from the server
		$.ajax({
			type: "POST",
			accept: "application/json",
			//contentType:"application/json; charset=utf-8",
			url: server_url,
			//headers: GRAPH_DATABASE_AUTH,
			timeout: REST_TIMEOUT,
			data: JSON.stringify({"gremlin" : gremlin_query}),
			success: function(data, textStatus, jqXHR){
							var Data = data.result.data;
							//console.log(Data)
							//console.log("Results received")
							if(callback){
								callback(Data);
							} else {				
								handle_server_answer(Data,query_type,active_node,message);
							}
			},
			error: function(result, status, error){
				console.log("Connection failed. "+status);

				// This will hold all error messages, to be printed in the
				// output area.
				let msgs = [];

				if (query_type == 'editGraph'){
					msgs.push('Problem accessing the database using REST at ' + server_url);
					msgs.push('Message: ' + status + ', ' + error);
					msgs.push('Possible cause: creating an edge with bad node ids ' +
						'(linking nodes not existing in the DB).');
				} else {
					msgs.push(gremlin_query);
					msgs.push('Can\'t access database using REST at ' + server_url);
					msgs.push('Message: ' + status + ', ' + error);
					msgs.push('Check the server configuration ' +
						'or try increasing the REST_TIMEOUT value in the config file.');
				}

				// If a MalformedQueryException is received, user might be
				// trying to reach an Amazon Neptune DB. Point them to the
				// config file as a probable cause.
				if (result.status === 400
					&& SINGLE_COMMANDS_AND_NO_VARS === false
					&& result.hasOwnProperty('responseJSON')
					&& result.responseJSON.code === 'MalformedQueryException') {
					msgs.push('If connecting to an Amazon Neptune databse, ensure that ' +
						'SINGLE_COMMANDS_AND_NO_VARS is set to true in the config file.');
				}

				$('#outputArea').html(msgs.map(function (i) {return '<p>' + i + '</p>'}).join(''));
				$('#messageArea').html('');
			}
		});
	}

	//////////////////////////////////////////////////////////////////////////////////////////////////////
	// Websocket connection
	/////////////////////////////////////////////////////////////////////////////////////////////////////
	function run_websocket_request(gremlin_query,server_url,query_type,active_node,message,callback){
		console.log("run_websocket_request");
		$('#messageArea').html('<h3>(loading)</h3>');

		var msg = { "requestId": uuidv4(),
			"op":"eval",
			"processor":"",
			"args":{"gremlin": gremlin_query,
				"bindings":{},
				"language":"gremlin-groovy"}}

		var data = JSON.stringify(msg);

		var ws = new WebSocket(server_url);
		ws.onopen = function (event){
			ws.send(data,{ mask: true});	
		};
		ws.onerror = function (err){
			console.log('Connection error using websocket');
			console.log(err);
			if (query_type == 'editGraph'){
				$('#outputArea').html("<p> Connection error using websocket</p>"
					+"<p> Problem accessing "+server_url+ " </p>"+
					"<p> Possible cause: creating a edge with bad node ids "+
					"(linking nodes not existing in the DB). </p>");
				$('#messageArea').html('');
			} else {$('#outputArea').html("<p> Connection error using websocket</p>"
					+"<p> Cannot connect to "+server_url+ " </p>");
				$('#messageArea').html('');
			}

		};
		ws.onmessage = function (event){
			var response = JSON.parse(event.data);
			var code=Number(response.status.code)
			if(!isInt(code) || code<200 || code>299) {
				$('#outputArea').html(response.status.message);
				$('#messageArea').html("Error retrieving data");
				return 1;
			}
			var data = response.result.data;
			if (data == null){
				if (query_type == 'editGraph'){
					$('#outputArea').html(response.status.message);
					$('#messageArea').html('Could not write data to DB.' +
						"<p> Possible cause: creating a edge with bad node ids "+
						"(linking nodes not existing in the DB). </p>");
					return 1;
				} else {
					//$('#outputArea').html(response.status.message);
					//$('#messageArea').html('Server error. No data.');
					//return 1;
				}
			}
			//console.log(data)
			//console.log("Results received")
			if(callback){
				callback(data);
			} else {
				handle_server_answer(data,query_type,active_node,message);
			}
		};		
	}

	// Generate uuid for websocket requestId. Code found here:
	// https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
	function uuidv4() {
	  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	  });
	}

	//////////////////////////////////////////////////////////////////////////////////////////////////
	function handle_server_answer(data,query_type,active_node,message){
		let COMMUNICATION_METHOD = $('#communication_method').val();
		if (query_type == 'editGraph'){
			//console.log(data)
			$('#outputArea').html("<p> Data successfully written to the DB.</p>");
			$('#messageArea').html('');
			return // TODO handle answer to check if data has been written
		}
		//console.log(COMMUNICATION_METHOD)
		if (COMMUNICATION_METHOD == 'GraphSON3'){
			//console.log(data)
			data = graphson3to1(data);
			var arrange_data = arrange_datav3;
		} else if (COMMUNICATION_METHOD == 'GraphSON2'){
			var arrange_data = arrange_datav2;
		} else {
			console.log('Bad communication protocol. Accept "GraphSON2" or "GraphSON3".'
				+' Using default GraphSON3.')
			data = graphson3to1(data);
			var arrange_data = arrange_datav3;
		}
		if (!(0 in data)) {
			message = 'No data. Check the communication protocol. (Try changing Gremlin version to 3.3.*).'
			console.log(message)
			$('#outputArea').html(message);
			$('#messageArea').html('');

		}
		if (query_type=='graphInfo'){
			infobox.display_graph_info(data);
			_node_properties = make_properties_list(data[1][0]);
			_edge_properties = make_properties_list(data[3][0]);
			change_nav_bar(_node_properties,_edge_properties);
			display_properties_bar(_node_properties,'nodes','Node properties:');
			display_properties_bar(_edge_properties,'edges','Edge properties:');
			display_color_choice(_node_properties,'nodes','Node color by:');
		} else {
			//console.log(data);
			var graph = arrange_data(data);
			//console.log(graph)
			if (query_type=='click') var center_f = 0; //center_f=0 mean no attraction to the center for the nodes 
			else if (query_type=='search') var center_f = 1;
			else return;
			graph_viz.refresh_data(graph,center_f,active_node);
		}

		$('#outputArea').html(message);
		$('#messageArea').html('');
	}



	//////////////////////////////////////////////////////////////////////////////////////////////////
	function make_properties_list(data){
		var prop_dic = {};
		for (var prop_str in data){
			prop_str = prop_str.replace(/[\[\ \"\'\]]/g,''); // get rid of symbols [,",',] and spaces
			var prop_list = prop_str.split(',');
			//prop_list = prop_list.map(function (e){e=e.slice(1); return e;});
			for (var prop_idx in prop_list){
				prop_dic[prop_list[prop_idx]] = 0;
			}
		}
		var properties_list = [];
		for (var key in prop_dic){
			properties_list.push(key);
		}
		return properties_list;
	}

	///////////////////////////////////////////////////
	function idIndex(list,elem) {
	  // find the element in list with id equal to elem
	  // return its index or null if there is no
	  for (var i=0;i<list.length;i++) {
		if (list[i].id == elem) return i;
	  }
	  return null;
	}  

	/////////////////////////////////////////////////////////////
	function arrange_datav2(data) {
		// Extract node and edges from the data returned for 'search' and 'click' request
		// Create the graph object
		var nodes=[], links=[];
		for (var key in data){
			data[key].forEach(function (item) {
			if (item.type=="vertex" && idIndex(nodes,item.id) == null) // if vertex and not already in the list
				nodes.push(extract_infov2(item));
			if (item.type=="edge" && idIndex(links,item.id) == null)
				links.push(extract_infov2(item));
			});
		}
	  return {nodes:nodes, links:links};
	}

	function arrange_datav3(data) {
		// Extract node and edges from the data returned for 'search' and 'click' request
		// Create the graph object
		var nodes=[], links=[];
		if(data!=null) {
			for (var key in data){
				if(data[key]!=null) {
					data[key].forEach(function (item) {
						if (!("inV" in item) && idIndex(nodes,item.id) == null){ // if vertex and not already in the list
							item.type = "vertex";
							nodes.push(extract_infov3(item));
						}
						if (("inV" in item) && idIndex(links,item.id) == null){
							item.type = "edge";
							links.push(extract_infov3(item));
						}
					});
				}
			}
		}
	  return {nodes:nodes, links:links};
	}


	function extract_infov2(data) {
		var data_dic = {id:data.id, label:data.label, type:data.type, properties:{}}
		var prop_dic = data.properties
		for (var key in prop_dic) {
			if (prop_dic.hasOwnProperty(key)) {
				data_dic.properties[key] = prop_dic[key]
			}
		}
		if (data.type=="edge"){
			data_dic.source = data.outV
			data_dic.target = data.inV
		}
		return data_dic
	}

	function extract_infov3(data) {
	var data_dic = {id:data.id, label:data.label, type:data.type, properties:{}}
	var prop_dic = data.properties
	//console.log(prop_dic)
	for (var key in prop_dic) { 
		if (prop_dic.hasOwnProperty(key)) {
			if (data.type == 'vertex'){// Extracting the Vertexproperties (properties of properties for vertices)
				var property = prop_dic[key];
				property['summary'] = get_vertex_prop_in_list(prop_dic[key]).toString();
			} else {
				var property = prop_dic[key]['value'];
			}
			//property = property.toString();
			data_dic.properties[key] = property;
			// If  a node position is defined in the DB, the node will be positioned accordingly
			// a value in fx and/or fy tells D3js to fix the position at this value in the layout
			if (key == node_position_x) {
				data_dic.fx = prop_dic[node_position_x]['0']['value'];
			}
			if (key == node_position_y) {
				data_dic.fy = prop_dic[node_position_y]['0']['value'];
			}
		}
	}
	if (data.type=="edge"){
		data_dic.source = data.outV;
		data_dic.target = data.inV;
		if (data.id !== null && typeof data.id === 'object'){
			console.log('Warning the edge id is an object')
			if ("relationId" in data.id){
				data_dic.id = data.id.relationId;
			}
		}
	}
	return data_dic
}

function get_vertex_prop_in_list(vertexProperty){
	var prop_value_list = [];
	for (var key in vertexProperty){
		//console.log(vertexprop);
		prop_value_list.push(vertexProperty[key]['value']);
	}
	return prop_value_list;
}

	function graphson3to1(data){
		// Convert data from graphSON v2 format to graphSON v1
		if (!(Array.isArray(data) || ((typeof data === "object") && (data !== null)) )) return data;
		if ('@type' in data) {
			if (data['@type']=='g:List'){
				data = data['@value'];
				return graphson3to1(data);
			} else if (data['@type']=='g:Set'){
				data = data['@value'];
				return data;
			} else if(data['@type']=='g:Map'){
				var data_tmp = {}
				for (var i=0;i<data['@value'].length;i+=2){
					var data_key = data['@value'][i];
					if( (typeof data_key === "object") && (data_key !== null) ) data_key = graphson3to1(data_key);
					//console.log(data_key);
					if (Array.isArray(data_key)) data_key = JSON.stringify(data_key).replace(/\"/g,' ');//.toString();
					data_tmp[data_key] = graphson3to1(data['@value'][i+1]);
				}
				data = data_tmp;
				return data;
			} else {
				data = data['@value'];
				if ( (typeof data === "object") && (data !== null) ) data = graphson3to1(data);
				return data;
			}
		} else if (Array.isArray(data) || ((typeof data === "object") && (data !== null)) ){
			for (var key in data){
				data[key] = graphson3to1(data[key]);
			}
			return data;
		}
		return data;
	}

	return {
		get_node_properties : get_node_properties,
		get_edge_properties : get_edge_properties,
		get_graph_info : get_graph_info,
		inspect_field : inspect_field,
		inspect_logic : inspect_logic,
		search_query : search_query,
		load_graph : load_graph,
		run_user_query : run_user_query,
		click_query : click_query,
		send_to_server : send_to_server
	}
})();
