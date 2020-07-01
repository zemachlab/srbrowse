"use strict";

const { rs } = require('./streams');
const deline = str => str.split(",").map((v,c) => v=="" ? [] : (c===4 ? v.split(";").map(v=>+(v)) : +(v)));

const indexReads = (env, filename, density=5000) => {
	let cb = 0;
	let ci = 1;
	const out = {0:cb};
	return rs([line => {
		const pos = +(line.split(',')[0]);
		if (Math.floor(pos / density) >= ci) {
			ci = Math.floor(pos / density);
			if (out[ci-1] !== cb)
				out[ci] = cb;
		}
		cb += line.length + 1;
	}]).on('finish', () => {
		require('fs').writeFile(filename+".idx", JSON.stringify({density: density, idx: out}), err => {
			if (err)
				env.logger("Failed to create index file: "+err);
		});
	});
};

const addTrack = (env, options) => {
	const type = "bseq";
	const redis = require('redis').createClient();
	redis.incr("track_id", (err, track_id) => {
		if (err) {
			redis.quit();
			return env.res.json({error: "Unable to access redis server: "+err});
		}
		redis.multi()
			.hmset("track:"+track_id, Object.assign(options, {track_id, status: "processing"}))
			.lpush("tracks", track_id)
			.lpush("genome_tracks:"+options['reference_assembly'], track_id)
			.exec(err => {
				redis.quit();
				if (err)
					return env.res.json({error: "Unable to save track to redis server: "+err});
				require('./pipelines')[type](env, track_id, options);
				env.res.json({process: 0});
			});
	});
};

const combineTracks = (env, options) => {
	const track_ids = options['tracks'].split(',');
	const redis = require('redis').createClient();
	redis.incr("track_id", (err, track_id) => {
		if (err) {
			redis.quit();
			return env.res.json({error: "Unable to access redis server: "+err});
		}
		track_ids.reduce((a,v)=>a.hgetall("track:"+v), redis.multi()).exec((err, tracks) => {
			if (err || !tracks) {
				redis.quit();
				return env.res.json({error: "Tracks not found: "+err});
			}
			const assembly = tracks[0]['reference_assembly'];
			const layout = tracks[0]['layout']; // Incorrect
			const stat_labels = ["processed", "aligned", "duplicates", "mmappers", "reads"];
			const stats = stat_labels.map(v=>tracks.map(track=>+(track[v])).reduce((a,v)=>a+v));
			redis.multi()
				.hmset("track:"+track_id, "track_id", track_id, "label", options['label'], "reference_assembly", assembly, "layout", layout, "combined", options['tracks'], ...(stat_labels.reduce((a,v,i)=>a.concat([v, stats[i]]), [])), "status", 1)
				.lpush("tracks", track_id)
				.lpush("genome_tracks:"+assembly, track_id)
				.exec(err => {
					redis.quit();
					if (err)
						return env.res.json({error: "Unable to save track to redis server: "+err});
					const track_file = env.config.base_dir+"/tracks/"+track_id+".reads";
					require('child_process').exec(`cat ${track_ids.map(v=>env.config.base_dir+"/tracks/"+v+".reads").join(' ')} | sort -t, -k1,1n -o ${track_file}`, err => {
						if (err)
							return env.res.json({error: "Unable to combine track files: "+err});
						require('fs').createReadStream(track_file).pipe(indexReads(env, track_file));
					});
				});
		});
	});
};

const removeTrack = (env, id) => {
	// Remove track:id, genome_tracks:genome_id, files
	if (!id || id === "" || id === "*")
		return env.res.json({error: "Invalid track format"});
	const redis = require('redis').createClient();
	redis.hgetall("track:"+id, (err, track) => {
		if (err) {
			redis.quit();
			return env.res.json({error: "Track does not exist"});
		}
		const genome = track['reference_assembly'];
		redis.multi()
			.lrem("tracks", 1, id)
			.lrem("genome_tracks:"+genome, 1, id)
			.del("track:"+id)
			.exec(err => {
				if (err)
					return env.res.json({error: env.logger("Failed to remove track from redis: "+err)});
				require('child_process').exec("rm "+env.config.base_dir+"/tracks/"+id+".reads "+env.config.base_dir+"/tracks/"+id+".reads.idx", err => {
					env.res.json({success: 1});
				});
			});
	});
};

const loadTrack = (env, track, pos, span) => {
	const padding = 500; // TODO: optimize
	return new Promise((resolve, reject) => {
		env.cache.retrieve("track", track).then(data => {
			const region = [Math.max(pos-padding, 0), Math.max(+(pos) + +(span) + padding, 0)];
			const idx_pos = [Math.floor(region[0]/data['density']), Math.ceil(region[1]/data['density'])];
			const bp = [data['idx'][Math.max(idx_pos[0] - 1, 0)], data['idx'][Math.max(idx_pos[1] - 1, 1)]];
			if (bp[0] >= bp[1])
				return resolve([]);
			const reads = [];
			require('fs').createReadStream(env.config.base_dir+"/tracks/"+track+".reads", {start: bp[0], end: bp[1]}).pipe(rs([line => {
				const read = deline(line);
				if (read.length !== 5 || (read[1] !== 0 && read[1] !== 1) || read[0] + read[2] < pos || read[0] > pos + span)
					return;
				reads.push(read);
			}])).on('finish', () => {
				resolve(reads);
			});
		});
	});
};

module.exports = { add: addTrack, combine: combineTracks, load: loadTrack, remove: removeTrack };
