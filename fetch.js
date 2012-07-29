var Deferred = require('Deferred');
var fs = require('fs');
var request = require('request');
var util = require('util');
var url = require('url');
var path = require('path');

var configFile = (function() {
	var configPath = __dirname + '/config.json';
	var config;

	return {
		load: function() {
			console.log("Loading config");
			var deferred = new Deferred();
			
			fs.readFile(configPath, function(err, data) {
				if ( data ) {
					console.log("Config loaded");
					config = JSON.parse( data );
				}
				deferred.resolve( config );
			});

			return deferred;
		}
	};
})();

function getImageUrls(config) {
	var perPage = 100;
	var baseUrl = "http://api.flickr.com/services/rest/?method=flickr.photosets.getPhotos&api_key=%s&photoset_id=%s&extras=url_o&per_page=" + perPage + "&page=%d&format=json&nojsoncallback=1";
	var imageUrls = [];
	var page = 1;
	var namesDeferred = new Deferred();

	function fetchPage() {
		request.get({
			url: util.format( baseUrl, config.apiKey, config.set, page ),
			json: true	
		}, function(err, response, data) {
			if ( err || data.stat != "ok" ) {
				namesDeferred.reject( err || data.stat );
				return;
			}

			imageUrls.push.apply( imageUrls, data.photoset.photo.map(function(photo) {
				return photo.url_o;
			}));

			if (data.photoset.total > page * perPage) {
				namesDeferred.notify();
			}
			else {
				namesDeferred.resolve( imageUrls );
			}
		});
	}

	fetchPage();
	return namesDeferred.progress(function() {
		page++;
		fetchPage();
	});
}

function saveImages(imageUrls, config) {
	var deferred = new Deferred();
	var requested = 0;
	var completed = 0;
	var concurrently = 3;
	var total = imageUrls.length;

	function fetchImage( u ) {
		var deferred = new Deferred();
		var filename = url.parse( u ).path.match(/[^\/]+$/)[0];
		console.log("Saving", u, "to", filename);

		request.get( u, function() {
			console.log("Image downloaded", u);
			deferred.resolve();
		}).pipe( fs.createWriteStream( path.join(config.location, filename), {
			mode: 0600
		}));

		return deferred;
	}
	
	function makeNextRequest() {
		fetchImage( imageUrls[requested] ).done(function() {
			completed++;

			if ( completed == total ) {
				console.log("All images fetched & saved");
				deferred.resolve();
			}
			else {
				deferred.notify();	
			}
		});

		requested++;
	}

	var initialRequests = Math.min( concurrently, total );

	while (initialRequests--) {
		makeNextRequest();
	}

	return deferred.progress(function() {
		if ( requested < total ) {
			makeNextRequest();
		}
	});
}

function filterExistingFiles( imageUrls, config ) {
	console.log("Filtering against what we already have");
	var files = fs.readdirSync( config.location );

	return imageUrls.filter(function(u) {
		var keep = files.indexOf( url.parse( u ).path.match(/[^\/]+$/)[0] ) == -1;
		if ( !keep ) {
			console.log( "Skipping", u );
		}
		return keep;
	});
}

function deleteExtraneous( imageUrls, config ) {
	var urls = imageUrls.join();
	var files = fs.readdirSync( config.location ).forEach(function(file) {
		if ( urls.indexOf( file ) == -1 ) {
			console.log( "Deleting", file );
			fs.unlink( path.join( config.location, file ) );
		}
	});
}

configFile.load().done(function(config) {
	getImageUrls( config ).pipe(function( imageUrls ) {
		deleteExtraneous( imageUrls, config );
		return filterExistingFiles( imageUrls, config );
	}).pipe(function( imageUrls ) {
		return saveImages( imageUrls, config );
	});
});
