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

configFile.load(function(config) {
	console.log(config);
});