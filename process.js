var Q = require('q');
var PopitToolkit = require('popit-toolkit');
var fs = require("fs");
var request = require('request');
var beautify = require('js-beautify').js_beautify;

var config = null;
var content; // = require("./cargos.json"); //Google spreadsheet exported as JSON
var toolkit;

function downloadSpreadsheet() {

  var deferred = Q.defer();

  request(config.gsheetsUrl, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      fs.writeFileSync('cargos.json',  beautify(body, { indent_size: 2 }));
      deferred.resolve();
    } else {
      deferred.reject("Error getting file")
    }
  })

  return deferred.promise;
}

function loadSpreadsheetData() {
  var deferred = Q.defer();
  content = require('./cargos.json')
  deferred.resolve();
  return deferred.promise;
}

function importTerritorios() {

  var deferred = Q.defer();

  var territorios = {};

  content.feed.entry.forEach(function(item) {
    territorios[item.gsx$territorio.$t] = (territorios[item.gsx$territorio.$t] || 0) + 1;
  });

  var itemsToPost = [];

  for (territorio in territorios) {
    itemsToPost.push({
      name: territorio
    });
  }

  // console.log(itemsToPost);
  toolkit.postItems('organizations', itemsToPost).then(
    function() {
      console.log('done');
      deferred.resolve();
    },
    function(err) {
      console.log('err', err);
      deferred.reject(err)
    },
    function(progress) {
      console.log(progress);
    }
  )

  return deferred.promise;

}

function popitCreatePersons() {

  var deferred = Q.defer();
  var personas = {};
  var personasArr = [];

  content.feed.entry.forEach(function(item, ix) {

    try{

      var key = item.gsx$nombre.$t + ' ' + item.gsx$apellido.$t;
      
      if(!personas[key]){

        personas[key] = 1; //de-duplicate

        var persona = {
          name: item.gsx$nombre.$t + ' ' + item.gsx$apellido.$t,
          family_name: item.gsx$apellido.$t,
          given_name: item.gsx$nombre.$t,
          image: item.gsx$urlfoto.$t,
          gender: item.gsx$sexo.$t
        };

        if( item.gsx$nrodedoc.$t ){
          persona.identifiers = [{
            identifier: item.gsx$nrodedoc.$t,
            scheme: item.gsx$documentotipo.$t
          }]
        }

        personasArr.push(persona);

      }

    }catch(ex){
      console.log("Error importing Person")
      console.log(ex.stack);
    }

  });

  toolkit.postItems('persons', personasArr).then(
    function() {
      console.log("done");
      deferred.resolve();
    },
    function(err) {
      console.log('err', err);
      deferred.reject(err);
    },
    function(p) {
      console.log(p)
    }
  );

  return deferred.promise;
}

function postItemsPosts() {

  var deferred = Q.defer();

  var allOrganizations = require('./organizations.json');

  var organizations = allOrganizations.reduce(function(memo, organization) {
    memo[organization.name] = organization;
    return memo;
  }, {});

  var postsInfo = {};

  // postsInfo[territorio][cargo]
  // territorio -> organization
  // post -> post in an organization

  content.feed.entry.forEach(function(item) {

    var cargo = (item.gsx$cargonominal.$t + ' ' + item.gsx$cargoext.$t).trim();

    postsInfo[item.gsx$territorio.$t] = postsInfo[item.gsx$territorio.$t] || {};
    postsInfo[item.gsx$territorio.$t][cargo] = postsInfo[item.gsx$territorio.$t][cargo] || {};
    postsInfo[item.gsx$territorio.$t][cargo].duracioncargo = item.gsx$duracioncargo.$t;
    postsInfo[item.gsx$territorio.$t][cargo].cargotipo = item.gsx$cargotipo.$t;
    postsInfo[item.gsx$territorio.$t][cargo].cargoclase = item.gsx$cargoclase.$t;
    postsInfo[item.gsx$territorio.$t][cargo].cargonominal = item.gsx$cargonominal.$t;

  });

  var postsToPost = [];

  for (territorio in postsInfo) {
    for (cargonominal in postsInfo[territorio]) {

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
    function() {
      console.log('done');
      deferred.resolve();
    },
    function(err) {
      console.log('err', err);
      deferred.reject(err);
    },
    function(progress) {
      totalItems -= 1;
      console.log(totalItems);
      console.log(progress);
    }
  );

  return deferred.promise;

}


function postItemsMemberships() {

  var allOrganizations = require("./organizations.json");
  var allPosts = require("./posts.json");
  var allPersons = require("./persons.json");

  var deferred = Q.defer();

  var dateRe = /^[0-9]{4}(-[0-9]{2}){0,2}$/;

  var organizations = allOrganizations.reduce(function(memo, organization) {
    memo[organization.name] = organization;
    return memo;
  }, {});

  var persons = allPersons.reduce(function(memo, person) {
    memo[person.name] = person;
    return memo;
  }, {});

  var posts = allPosts.reduce(function(memo, post) {
    memo[post.organization_id] = memo[post.organization_id] || {};
    memo[post.organization_id][post.label] = post;
    return memo;
  }, {});

  var membershipsToPost = [];

  var invalids = 0;

  content.feed.entry.forEach(function(item) {

    var cargo = (item.gsx$cargonominal.$t + ' ' + item.gsx$cargoext.$t).trim();

    var membership = {
      "label": cargo,
      "role": cargo,
      "person_id": persons[item.gsx$nombre.$t + " " + item.gsx$apellido.$t].id,
      "organization_id": organizations[item.gsx$territorio.$t].id,
      "post_id": posts[organizations[item.gsx$territorio.$t].id][cargo].id,
      "cargonominal": item.gsx$cargonominal.$t
    };

    var startDate = transformDateStr(item.gsx$fechainicio.$t); // || item.gsx$fechainicioyear.$t;
    if (startDate) {
      membership.start_date = startDate;
    }

    var endDate = transformDateStr(item.gsx$fechafin.$t); // || item.gsx$fechafinyear.$t;
    if (endDate) {
      membership.end_date = endDate;
    }

    if (!startDate) {
      if (item.gsx$fechainicioyear.$t) {
        membership.start_date = item.gsx$fechainicioyear.$t + "-12-10";
        membership.start_date_accuracy = "year";
      }
    }

    if (!endDate) {
      if (item.gsx$fechafinyear.$t) {
        membership.end_date = item.gsx$fechafinyear.$t + '-12-10';
        membership.end_date_accuracy = "year";
      }
    }

    //Validate dates
    if (startDate && !dateRe.test(startDate)) {
      console.log('invalid start ', startDate);
    }

    if (endDate && !dateRe.test(endDate)) {
      console.log('invalid end ', endDate);
    }

    membershipsToPost.push(membership);

  });

  var totalItems = membershipsToPost.length;


  toolkit.postItems('memberships', membershipsToPost).then(
    function() {
      console.log('done');
      deferred.resolve();
    },
    function(err) {

      console.log('THERE IS AN ERROR HERE err', err);
      deferred.reject(err);
    },
    function(progress) {
      totalItems -= 1;
      console.log(totalItems);
      console.log(progress);
    }
  );

  return deferred.promise;

}

// postItemsMemberships( 
// 	require("./organizations.json"), 
// 	require("./posts.json"), 
// 	require("./persons.json") ) ;

function transformDateStr(input) {
  var p = input.split('/');
  var res = [];
  if (p.length == 3) {
    res.push(p[2]);
    res.push('-');
    if (p[1].length == 1) {
      res.push('0');
    }
    res.push(p[1]);
    res.push('-');
    if (p[0].length == 1) {
      res.push('0');
    }
    res.push(p[0]);
    return res.join('');
  }
}


function popitLoadPersons() {

  return Q.Promise(function(resolve, reject, notify) {
    toolkit.loadAllItems('persons').then(function(personas) {
      var p = JSON.stringify(personas);
      fs.writeFileSync('persons.json', beautify(p, { indent_size: 2 }));
      console.log('total personas', personas.length)
      resolve();
    }, function(err) {
      console.log('error', err);
      reject();
    }, function(progress) {
      console.log(progress);
      notify(progress);
    });
  });

}

function loadAllOrganizations() {
  return Q.Promise(function(resolve, reject, notify) {
    toolkit.loadAllItems('organizations').then(function(organizations) {
      var p = JSON.stringify(organizations);
      fs.writeFileSync('organizations.json', p);
      console.log('total organizations', organizations.length)
      resolve();
    }, reject, function(p) {
      console.log(p)
      notify(p);
    });
  })
}

function loadAllPosts() {

  return Q.Promise(function(resolve, reject, notify) {

    console.log('loading posts')
    toolkit.loadAllItems('posts').then(function(posts) {
      var p = JSON.stringify(posts);
      fs.writeFileSync('posts.json', p);
      console.log('total posts', posts.length)
      resolve();
    });

  })

}

function showCargosExtendidos() {
  var cargosExt = {};
  content.feed.entry.forEach(function(item) {
    cargosExt[item.gsx$cargoext.$t] = (cargosExt[item.gsx$cargoext.$t] || 0) + 1;
  });

  console.log(cargosExt);
}

//showCargosExtendidos();

function loadAllMemberships() {

  return Q.Promise(function(resolve, reject, notify) {

    toolkit.loadAllItems('memberships').then(function(posts) {
      var p = JSON.stringify(posts);
      fs.writeFileSync('memberships.json', p);
      console.log('total members', posts.length)
      resolve();
    }, function(err) {
      console.log('error', err);
      reject(err);
    }, function(progress) {
      console.log(progress);
      notify(progress);
    });

  });
}

function deletePersonas() {
  var mem = require('./persons.json').map(function(it) {
    return it.id;
  });
  var pending = mem.length;
  return toolkit.deleteItems('persons', mem).then(
    function() {
      console.log('done')
    },
    function(err) {
      console.log('err', err)
    },
    function(progress) {
      pending -= 1;
      console.log('pending ', pending);
    }
  );
}

function deleteOrganizations() {
  var mem = require('./organizations.json').map(function(it) {
    return it.id;
  });
  var pending = mem.length;
  console.log("Deleting organizations: " + pending);
  return toolkit.deleteItems('organizations', mem).then(
    function() {
      console.log('done')
    },
    function(err) {
      console.log('err', err)
    },
    function(progress) {
      pending -= 1;
      console.log('pending ', pending);
    }
  );
}

function deleteMemberships() {
  console.log("Deleting Memberships")
  var mem = require('./memberships.json').map(function(it) {
    return it.id;
  });
  var pending = mem.length;
  return toolkit.deleteItems('memberships', mem).then(
    function() {
      console.log('done')
    },
    function(err) {
      console.log('err', err)
    },
    function(progress) {
      pending -= 1;
      console.log('pending ', pending);
    }
  );
}

function deletePosts() {
  var mem = require('./posts.json').map(function(it) {
    return it.id;
  });
  var pending = mem.length;
  return toolkit.deleteItems('posts', mem).then(
    function() {
      console.log('done')
    },
    function(err) {
      console.log('err', err)
    },
    function(progress) {
      pending -= 1;
      console.log('pending ', pending);
    }
  );
}

function runProgram(argv) {

  if (argv.length != 4) {
    console.log("Usage: node process.js [import|delete] [instanceName]")
  } else {

    var action = argv[2];
    var instance = argv[3];

    config = require("./config_" + instance + ".json");
    console.log("Instance: " + config.host);

    toolkit = PopitToolkit({
      host: config.host,
      Apikey: config.Apikey
    });

    if (["import", "delete"].indexOf(action) == -1) {
      console.log("Invalid action " + action);
      return;
    }

    if (action == "import") {
      runImport();
    } else if (action = "delete") {
      runDelete();
    }

  }

}


function runImport() {

  Q.fcall(function(){})
    //.then(downloadSpreadsheet)
    .then(loadSpreadsheetData)
    .then(popitCreatePersons)
    .then(popitLoadPersons)
    // .then(popitCreateOrganizations)
    // .then(popitLoadOrganizations)
    // .then(popitCreateMemberships)
    .catch(function(err) {
      console.log("Something went wrong");
      throw err;
    })
    .done();

}

function runDelete() {

  Q.fcall(popitLoadMemberships)
    .then(popitDeleteMemberships)
    .then(popitLoadOrganizations)
    .then(popitDeleteOrganizations)
    .then(popitLoadPersons)
    .then(popitDeletePersons)
    .catch(function(err) {
      console.log("Something went wrong");
      throw err;
    })
    .done();

}

runProgram(process.argv);