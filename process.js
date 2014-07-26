
var toolkit = require('popit-toolkit');
var fs = require("fs");

var config = require("./config.json");  //config file with user and password (not uploaded here)
var content = require("./cargos.json"); //Google spreadsheet exported as JSON

toolkit.config({
	host: 'cargografias.popit.mysociety.org', 
	user: config.user, 
	password: config.password
});

function importTerritorios(){

	var territorios = {};

	content.feed.entry.forEach(function(item){
		territorios[ item.gsx$territorio.$t ] = (territorios[ item.gsx$territorio.$t ] || 0) + 1;
	});

	var itemsToPost = [];

	for (territorio in territorios){
		itemsToPost.push({ name: territorio});
	}

	toolkit.postItems('organizations', itemsToPost);
}

function postItemsPersonas(){
	
	var personas = {};
	var personasArr = [];
	
	content.feed.entry.forEach(function(item){
		personas[ item.gsx$nombre.$t + ' ' + item.gsx$apellido.$t ] = (personas[ item.gsx$nombre.$t + ' ' + item.gsx$apellido.$t ] || 0) + 1;
	});

	for(persona in personas){
		personasArr.push(persona);
	}
	personasArr.sort();
	console.log(personasArr)
	console.log(personasArr.length)

	var personasArr2 = personasArr.map( function(p){ return {name: p}; } );

	toolkit.postItems('persons', personasArr2).then(
		function(){ console.log("done")}, 
		function(){}, 
		function(p){ console.log(p)  }
		);
}

function postItemsPosts( allOrganizations ){
	
	var organizations = allOrganizations.reduce(function( memo, organization){
		memo[organization.name] = organization;
		return memo;
	}, {});

	var postsInfo = {};

	// postsInfo[territorio][cargo]
	// territorio -> organization
	// post -> post in an organization

	content.feed.entry.forEach(function(item){

		var cargo = ( item.gsx$cargonominal.$t + ' ' + item.gsx$cargoext.$t ) .trim() ; 

		postsInfo[ item.gsx$territorio.$t ] = postsInfo[ item.gsx$territorio.$t ] || {};
		postsInfo[ item.gsx$territorio.$t ][ cargo ] = postsInfo[ item.gsx$territorio.$t ][ cargo ] || {};  
		postsInfo[ item.gsx$territorio.$t ][ cargo ].duracioncargo = item.gsx$duracioncargo.$t;
		postsInfo[ item.gsx$territorio.$t ][ cargo ].cargotipo = item.gsx$cargotipo.$t;
		postsInfo[ item.gsx$territorio.$t ][ cargo ].cargoclase = item.gsx$cargoclase.$t;
		postsInfo[ item.gsx$territorio.$t ][ cargo ].cargonominal = item.gsx$cargonominal.$t;

	});

	var postsToPost = [];

	for (territorio in postsInfo){
		for(cargonominal in postsInfo[territorio]){

			postsToPost.push({
				label: cargonominal, 
				organization_id: organizations[territorio].id, 
				role: cargonominal, 
				cargonominal: postsInfo[territorio][cargonominal].cargonominal,
				duracioncargo: postsInfo[territorio][cargonominal].duracioncargo,
				cargotipo: postsInfo[territorio][cargonominal].cargotipo,
				cargoclase: postsInfo[territorio][cargonominal].cargoclase
			});

		}
	}

	var totalItems = postsToPost.length;
	toolkit.postItems('posts', postsToPost).then(
		function(){ console.log('done') }, 
		function(err){ console.log('err', err) }, 
		function(progress){ totalItems-=1; console.log(totalItems); console.log(progress); }
		);

}

//postItemsPosts (require('./organizations.json'));


function postItemsMemberships( allOrganizations, allPosts, allPersons ){

	var dateRe = /^[0-9]{4}(-[0-9]{2}){0,2}$/;

	var organizations = allOrganizations.reduce(function( memo, organization){
		memo[organization.name] = organization;
		return memo;
	}, {});

	var persons = allPersons.reduce(function(memo, person){
		memo[person.name] = person;
		return memo;
	}, {});

	var posts = allPosts.reduce( function(memo, post){
		memo[ post.organization_id ] = memo[ post.organization_id ] || {};
		memo[ post.organization_id ][ post.label ] = post;
		return memo;
	}, {});

	var membershipsToPost = [];

	content.feed.entry.forEach(function(item){

		var cargo = ( item.gsx$cargonominal.$t + ' ' + item.gsx$cargoext.$t ) .trim() ; 

		var membership = {
			  "label": cargo,
			  "role": cargo,
			  "person_id": persons[ item.gsx$nombre.$t + " " + item.gsx$apellido.$t].id,
			  "organization_id": organizations[ item.gsx$territorio.$t ].id,
			  "post_id": posts[organizations[ item.gsx$territorio.$t ].id][ cargo ].id, 
			  "cargonominal": item.gsx$cargonominal.$t
		};

		var startDate = transformDateStr(item.gsx$fechainicio.$t); // || item.gsx$fechainicioyear.$t;
		if(startDate){
			membership.start_date = startDate;
		}

		var endDate = transformDateStr(item.gsx$fechafin.$t);// || item.gsx$fechafinyear.$t;
		if(endDate){
			membership.end_date = endDate;
		}

		if(!startDate){
			if( item.gsx$fechainicioyear.$t ){
				membership.start_date = item.gsx$fechainicioyear.$t + "-12-10";
				membership.start_date_accuracy = "year"; 
			}
		}

		if(!endDate){
			if( item.gsx$fechafinyear.$t ){
				membership.end_date = item.gsx$fechafinyear.$t + '-12-10';
				membership.end_date_accuracy = "year";
			}
		}

		//Validate dates
		if(startDate && !dateRe.test(startDate)){
			console.log('invalid start ', startDate);
		}
		
		if(endDate && !dateRe.test(endDate)){
			console.log('invalid end ', endDate);
		}

		membershipsToPost.push(membership);

	});

	var totalItems = membershipsToPost.length;


	toolkit.postItems('memberships', membershipsToPost).then(
		function(){ console.log('done') }, 
		function(err){ console.log('err', err) }, 
		function(progress){ totalItems-=1; console.log(totalItems); console.log(progress); }
	);

}

// postItemsMemberships( 
// 	require("./organizations.json"), 
// 	require("./posts.json"), 
// 	require("./persons.json") ) ;

function transformDateStr(input){
	var p = input.split('/');
	var res = [];
	if(p.length == 3){
		res.push(p[2]);
		res.push('-');
		if(p[1].length == 1) { res.push( '0' ); }
		res.push(p[1]);
		res.push('-');
		if(p[0].length == 1) { res.push( '0' ); }
		res.push(p[0]);
		return res.join('');
	}
}


function loadAllPersonas(){
	toolkit.loadAllItems('persons').then(function(personas){
		var p = JSON.stringify(personas);
		fs.writeFileSync('persons.json', p);
		console.log('total personas', personas.length)
	}, function(err){
		console.log('error', err);
	}, function(progress){
		console.log(progress);
	});
}

function loadAllOrganizations(){
	toolkit.loadAllItems('organizations').then(function(organizations){ 
		var p = JSON.stringify(organizations);
		fs.writeFileSync('organizations.json', p);
		console.log('total organizations', organizations.length)
	}, function(){}, function(p){ console.log(p)});	
}

function loadAllPosts(){
	toolkit.loadAllItems('posts').then(function(posts){ 
		var p = JSON.stringify(posts);
		fs.writeFileSync('posts.json', p);
		console.log('total posts', posts.length)

	});	
}

 function showCargosExtendidos(){
 	var cargosExt = {};
 	content.feed.entry.forEach(function(item){
		cargosExt[ item.gsx$cargoext.$t ] = (cargosExt[ item.gsx$cargoext.$t ] || 0) + 1;
	});	

	console.log(cargosExt);
 }

 //showCargosExtendidos();

 function loadAllMemberships(){
	toolkit.loadAllItems('memberships').then(function(posts){ 
		var p = JSON.stringify(posts);
		fs.writeFileSync('memberships.json', p);
		console.log('total memberss', posts.length)
	}, function(err){
		console.log('error', err);
	}, function(progress){
		console.log(progress);
	});	
 }

 function deletePersonas(){
 	var mem = require('./persons.json').map(function(it){ return it.id; });
 	var pending = mem.length;
 	toolkit.deleteItems('persons', mem ).then(
 		function(){ console.log('done') },
 		function(err){ console.log('err', err) }, 
 		function(progress){ pending -= 1; console.log('pending ', pending );  }
 		)  ;
 }

function deleteOrganizations(){
	var mem = require('./organizations.json').map(function(it){ return it.id; });
	var pending = mem.length;
	console.log("Deleting organizations: " + pending);
	toolkit.deleteItems('organizations', mem ).then(
		function(){ console.log('done') },
		function(err){ console.log('err', err) }, 
		function(progress){ pending -= 1; console.log('pending ', pending );  }
		)  ;
}

 function deleteMemberships(){
 	var mem = require('./memberships.json').map(function(it){ return it.id; });
 	var pending = mem.length;
 	toolkit.deleteItems('memberships', mem ).then(
 		function(){ console.log('done') },
 		function(err){ console.log('err', err) }, 
 		function(progress){ pending -= 1; console.log('pending ', pending );  }
 		)  ;
 }

function deletePosts(){
 	var mem = require('./posts.json').map(function(it){ return it.id; });
 	var pending = mem.length;
 	toolkit.deleteItems('posts', mem ).then(
 		function(){ console.log('done') },
 		function(err){ console.log('err', err) }, 
 		function(progress){ pending -= 1; console.log('pending ', pending );  }
 		)  ;
 }

