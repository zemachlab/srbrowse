"use strict";

const runDetached = (env, _args) => {
	const args = Object.entries(_args).map(v=>`--${v[0]}=${v[1]}`);
	const proc = require('child_process').spawn("node", [env.config.base_dir+"/cli.js", `--base_dir=${env.config.base_dir}`, ...args], {detached: true, stdio: 'ignore'});
	proc.on('error', e => {
		env.logger(e);
	});
	return proc['pid'];
};

const api = {
	init: (env, options) => {
		const redis = require('redis').createClient();
		redis.multi()
			.hgetall('genome:'+options['ref'])
			.smembers('annotations:'+options['ref'])
			.lrange('genome_tracks:'+options['ref'], 0, -1)
			.exec((err, data) => {
				if (err) {
					redis.quit();
					return env.res.json({error: "Could not load data from redis: "+err});
				}
				data[2].reduce((a,v)=>a.hgetall("track:"+v), redis.multi()).exec((err, tracks) => {
					env.res.json({genome: data[0], annotations: data[1], tracks: tracks.filter(v=>v['status']==="complete"||v['status']==="1"||v['status']==="aligned")});
					redis.quit();
				});
			});
	},
	data: (env, options) => {
		Promise.all([
			require('./genome').seq(env, options['ref'], options['pos'], options['span']),
			options['tracks'] == 0 ? Promise.resolve([]) : Promise.all(options['tracks'].map(track => require('./track').load(env, track, options['pos'], options['span']).then(reads => {return {[track]: reads}}))).then(data => data.reduce((a,v)=>Object.assign(a, v), {})),
			options['annotations'] == 0 ? Promise.resolve([]) : Promise.all(options['annotations'].filter(v=>v!=="").map(annotation => require('./genome').loadAnnotation(env, annotation, options['pos'], options['span']).then(elements => {return {[annotation]: elements}}))).then(data => data.reduce((a,v)=>Object.assign(a, v), {}))
		]).then(data => {
			env.res.json(data);
		});
	},
	seq: (env, options) => {
		require('./genome').seq(env, options['ref'], options['span'], options['pos'], options['span']).then(seq => {
			env.res.json({sequence: seq});
		});
	},
	annotations: (env, options) => {
		Promise.all(options['annotations'].map(annotation => require('./genome').loadAnnotation(env, annotation, options['pos'], options['span'], undefined, options['search']).then(elements => {return {[annotation]: elements}}))).then(data => {
			env.res.json({annotations: data.reduce((a,v)=>Object.assign(a, v), {})});
			env.cache.cleanup();
		});
	},
	reads: (env, options) => {
		Promise.all(options['tracks'].map(track => require('./track').load(env, track, options['pos'], options['span']).then(reads => {return {[track]: reads}}))).then(data => {
			env.res.json({tracks: data.reduce((a,v)=>Object.assign(a, v), {})});
			env.cache.cleanup();
		});
	},
	loadAnalysis: (env, options) => {
		require('./analysis').load(env, options['analysis_id']).then(filename => {
			env.res.sendFile(filename, {headers: {'Content-Type': 'text/plain', 'Content-Encoding': 'gzip'}});
		}).catch(e => {
			env.res.json({error: e.message});
		});
	},
	exportAnalysis: (env, options) => {
		require('./analysis').export(env, options['analysis_id'], options['format']).then(data => {
			env.res.json(data);
		}).catch(e => {
			env.res.json({error: e.message});
		});
	},
	addAnalysis: (env, options) => {
		if (env.type === "server") {
			const pid = runDetached(env, Object.assign({f: "addAnalysis"}, options));
			if (pid === undefined)
				return env.res.json({error: "Failed to run process"});
			env.res.json({});
		} else {
			require('./analysis').add(env, options);
		}
	},
	addAssembly: (env, options) => {
		env.res.json({processing: 1});
		require('./genome').addAssembly(env, options['label'], options['assembly_url']).then(() => {
			env.io.emit('notify', {process: 'addAssembly', details: options, finished: 1});
		}).catch(e => {
			env.io.emit('notify', {process: 'addAssembly', details: options, error: e.message});
		})
	},
	addTrack: (env, options) => {
		if (env.type === "server") {
			const pid = runDetached(env, Object.assign({f: "addTrack"}, options));
			if (pid === undefined)
				return env.res.json({error: "Failed to run process"});
			env.res.json({});
		} else {
			require('./track').add(env, options);
		}
	},
	combineTracks: (env, options) => {
		require('./track').combine(env, options);
	},
	addAnnotation: (env, options) => {
		require('./genome').addAnnotation(env, options['reference_assembly'], options['annotation_file']).then(label => {
			env.res.json({label: label});
		}).catch(e => {
			env.res.json({error: e.message});
		})
	},
	remove: (env, options) => {
		if (options['type'] === "track")
			require('./track').remove(env, options['id']);
	},
	query: (env, options) => {
		const redis = require('redis').createClient();
		const prefix = options['prefix'] !== undefined ? options['prefix'] : "";
		const type = options['type'] !== undefined ? options['type'] : "hgetall";
		const fn = prefix !== "" ? "lrange" : "keys";
		const args = fn === "lrange" ? [0, -1] : [];
		redis[fn](options['index'], ...args, (err, keys) => keys.reduce((a,v)=>a[type](prefix+v), redis.multi()).exec((err, data) => {
			redis.quit();
			if (err)
				return env.res.json({error: 'Error retrieving data'});
			env.res.json(data);
		}));
	},
	checkFiles: (env, options) => {
		Promise.all(options['files'].map(require('./helper').checkFASTQ)).then(data => {
			env.res.json(data);
		}).catch(e => {
			env.res.json({error: e.message});
		});
	},
};

module.exports = api;
