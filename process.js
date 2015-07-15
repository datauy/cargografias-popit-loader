var Q = require('q');
var PopitToolkit = require('popit-toolkit');
var fs = require("fs");
var request = require('request');
var beautify = require('js-beautify').js_beautify;
var crypto = require('crypto');

var config = null;
var content; // = require("./cargos.json"); //Google spreadsheet exported as JSON
var toolkit;

function downloadSpreadsheet() {

  var deferred = Q.defer();

  request(config.gsheetsUrl, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      fs.writeFileSync('data/cargos.json',  beautify(body, { indent_size: 2 }));
      deferred.resolve();
    } else {
      deferred.reject("Error getting file")
    }
  })

  return deferred.promise;
}

function loadSpreadsheetData() {
  var deferred = Q.defer();
  content = require('./data/cargos.json')
  deferred.resolve();
  return deferred.promise;
}

function popitCreateOrganizations() {

  var deferred = Q.defer();

  var organizations = {};
  var itemsToPost = [];

  content.feed.entry.forEach(function(item) {
    var key = item.gsx$organizacion.$t
    if(!organizations[key]){
      organizations[key] = 1;
      itemsToPost.push({
        name: key
      });  
    }
  });

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

function popitCreateMemberships() {

  var allOrganizations = require("./data/organizations.json");
  var allPersons = require("./data/persons.json");

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

  var membershipsToPost = [];

  var invalids = 0;

  content.feed.entry.forEach(function(item) {

    var membership = {
      "label": item.gsx$cargonominal.$t,
      "role": item.gsx$cargonominal.$t,
      "type": item.gsx$cargotipo.$t,
      "class": item.gsx$cargoclase.$t,
      "intended_duration": item.gsx$duracioncargo.$t,
      "person_id": persons[item.gsx$nombre.$t + " " + item.gsx$apellido.$t].id,
      "organization_id": organizations[item.gsx$organizacion.$t].id,
      "naming_date": item.gsx$fechanombramiento.$t,
      "area_id": item.gsx$areaid.$t,
      "party": item.gsx$partido.$t,
      "party_id": item.gsx$partidogeneral.$t,
      "heritage": item.gsx$patrimtotal.$t,
      "heritage_url": item.gsx$patrimurl.$t,
      "notes": item.gsx$observaciones.$t,
      "added_by": item.gsx$agregadopor.$t,
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

    //Sources
    if( item.gsx$fuentededatosinicio.$t || item.gsx$urlfuenteinicio.$t ){
      membership.sources = membership.sources || [];
      membership.sources.push({
        data: "start_date", 
        source: item.gsx$fuentededatosinicio.$t, 
        source_url: item.gsx$urlfuenteinicio.$t,
        quality: item.gsx$calidaddeldatoinicio.$t,
      });
    }

    if( item.gsx$fuentededatosfin.$t || item.gsx$urlfuentefin.$t ){
      membership.sources = membership.sources || [];
      membership.sources.push({
        data: "end_date", 
        source: item.gsx$fuentededatosfin.$t, 
        source_url: item.gsx$urlfuentefin.$t,
        quality: item.gsx$calidaddeldatofin.$t,
      });
    }

    if( item.gsx$territorio.$t ){
      membership.area = {
        id: item.gsx$territorio.$t + ', ' + item.gsx$territorioextendido.$t,
        name: item.gsx$territorio.$t + ', ' + item.gsx$territorioextendido.$t
      };       
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
      console.log('Error', err);
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
      fs.writeFileSync('data/persons.json', beautify(p, { indent_size: 2 }));
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

function popitLoadOrganizations() {
  return Q.Promise(function(resolve, reject, notify) {
    toolkit.loadAllItems('organizations').then(function(organizations) {
      var p = JSON.stringify(organizations);
      fs.writeFileSync('data/organizations.json', beautify(p, { indent_size: 2 }));
      console.log('total organizations', organizations.length)
      resolve();
    }, reject, function(p) {
      console.log(p)
      notify(p);
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

function popitLoadMemberships() {

  return Q.Promise(function(resolve, reject, notify) {

    toolkit.loadAllItems('memberships').then(function(posts) {
      var p = JSON.stringify(posts);
      fs.writeFileSync('data/memberships.json', beautify(p, { indent_size: 2 }));
      console.log('Total Memberships', posts.length)
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

function popitDeletePersons() {
  var mem = require('./data/persons.json').map(function(it) {
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

function popitDeleteOrganizations() {
  var mem = require('./data/organizations.json').map(function(it) {
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

function popitDeleteMemberships() {
  console.log("Deleting Memberships")
  var mem = require('./data/memberships.json').map(function(it) {
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

function cloudPost(photoUrl){

  return Q.Promise(function(resolve, reject, notify) {

    var unixTimeInSeconds = Math.floor(Date.now() / 1000);
    var apikey = config.cloudinary_apikey
    var secret = config.cloudinary_secret
    
    var params = {
      timestamp: unixTimeInSeconds, 
      format: "jpg",
      transformation: "w_200,h_200,c_thumb,g_face"
    }

    var signItems = []
    Object.keys(params).sort().forEach(function(key){
      signItems.push( key + '=' + params[key])
    })
    var signString = signItems.join('&') + secret;
    var signature = crypto.createHash('sha1').update( signString ).digest('hex')

    //not signing params:
    params.file = photoUrl;
    params.signature = signature;
    params.api_key = apikey;

    var reqOpts = {
      method: "POST",
      url: config.cloudinary_uploadurl,
      json: true,
      body: params
    };

    request(reqOpts, function(err, response, body){
      if(err){
        reject({
          err: err,
          response: response,
          body: body
        })
      }else{
        if(body.error){
          reject({
            err: body.error, 
            body: body
          })
        }else{
          resolve(body)
        }
      }
    })

  }); 

}

function updatePerson(person){

  return Q.promise(function(resolve, reject, notify){

    var url = "https://" + config.host + "/api/v0.1/persons/" + person.id;

    var options = {
      url: url,
      method: 'PUT',
      body: person,
      json: true,
      headers: {
        'Apikey': config.Apikey
      }
    }

    request(options, function(err, httpResponse, body) {
      if (err) {
        console.log(err)
        reject(err);
      } else {
        resolve(body);
      }
    })

  });
}

function createCloudinaryImageForPerson(person){
  return Q.Promise(function(resolve, reject, notify) {
    cloudPost(person.image)
    .then(function(result){

      person.image_original = person.image;
      person.image = result.secure_url;
      delete person.images;

      updatePerson(person)
      .then(function(result){
        console.log('completed', person.name)
        resolve(result)
      })
      .catch(function(err){
        console.log("error updating person", person, err)
        reject({ message: "error updating person", person: person, err: err});
      })

    })
    .catch(function(err){
      console.log("error creating cloudinary", person, err)
      reject({ message: "error creating cloudinary", person:person, err: err});
    });
  });
}

function popitUpdateCloudinary(){

  var cloudRE = /^(?:http\:|https\:|)\/\/res\.cloudinary\.com/
  return Q.Promise(function(resolve, reject, notify) {
    var persons = require('./data/persons.json');
    var promises = [];

    persons.forEach(function(person){
      if(person.image && !cloudRE.test(person.image)){
        promises.push(createCloudinaryImageForPerson(person));
      }
    })

    console.log("Total Persons:", persons.length)
    console.log('   To Process:', promises.length);
    var completed = 0;
    var errored = 0;

    Q.allSettled(promises)
    .then(function (results) {
        results.forEach(function (result) {
            if (result.state === "fulfilled") {
              completed ++;
                //var value = result.value;
            } else {
              errored++;
                var reason = result.reason;
            }
        });
        console.log("  Completed:", completed);
        console.log("  Errored:", errored);
        resolve();
    });
    
  });

}

function runProgram(argv) {

  if (argv.length != 4) {
    console.log("Usage: node process.js [import|delete|updatephotos] [instanceName]")
  } else {

    var action = argv[2];
    var instance = argv[3];

    config = require("./config/" + instance + ".json");
    console.log("Instance: " + config.host);

    toolkit = PopitToolkit({
      host: config.host,
      Apikey: config.Apikey
    });

    if (["import", "delete", "updatephotos"].indexOf(action) == -1) {
      console.log("Invalid action " + action);
      return;
    }

    if ("import" == action) {
      runImport();
    } else if ("delete" == action) {
      runDelete();
    } else if ("updatephotos" == action) {
      runUpdatePhotos();
    }

  }

}


function runImport() {

  Q.fcall(function(){})
    .then(downloadSpreadsheet)
    .then(loadSpreadsheetData)
    .then(popitCreatePersons)
    .then(popitLoadPersons)
    .then(popitCreateOrganizations)
    .then(popitLoadOrganizations)
    .then(popitCreateMemberships)
    .then(popitLoadMemberships)
    .catch(function(err) {
      console.log("Something went wrong");
      throw err;
    })
    .done();

}

function runDelete() {

  Q.fcall(function(){})
    .then(popitLoadMemberships)
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

function runUpdatePhotos() {

  Q.fcall(function(){})
    .then(popitLoadPersons)
    .then(popitUpdateCloudinary)
    .catch(function(err) {
      console.log("Something went wrong");
      throw err;
    })
    .done();

}


runProgram(process.argv);