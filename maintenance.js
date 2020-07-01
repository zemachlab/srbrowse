"use strict";

const generateDirectories = (env, dirs = ["genomes", "annotations", "tracks", "analyses", "tmp", "logs", "local"]) => {
	if (!env.config.base_dir || env.config.base_dir === "")
		return Promise.reject(env.logger("Base directory not defined"));
	const mkdir = require('util').promisify(require('fs').mkdir);
	return new Promise ((resolve, reject) => {
		Promise.all(dirs.map(dir=>mkdir(env.config.base_dir+"/"+dir).catch(e => e['code'] !== 'EEXIST' ? Promise.reject(e) : true)))
			.then(resolve).catch(e => {
				reject(env.logger("Failed to create some directories: "+e, 0));
			});
	});
};

const init = (env) => {
	return generateDirectories(env);
};

module.exports = {init};