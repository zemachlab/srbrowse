"use strict";

const acol = (arr,col) => arr.map(v=>v[col]);
const round = (n,p) => { var f = Math.pow(10, p); return Math.round(n * f) / f }
const cumsum = arr => { let sum = 0; const out = []; for (const v of arr) { sum += v; out.push(sum) } return out; }
const sum = arr => arr.reduce((a,v)=>a+v,0);
const mean = arr => arr.length === 0 ? 0 : sum(arr)/arr.length;
const colmean = arr => arr.length === 0 ? [] : [arr.length].concat(arr.reduce((a,v)=>a.map((_v,i)=>_v+v[i]), new Array(arr[0].length).fill(0)).map(v=>round(v/arr.length,3)));
const concatenate = arr => arr.reduce((a,v)=>a.concat(v), []);
const stddev = arr => { if (arr.length === 0) return 0; const m = mean(arr); let sq = 0; for (const v of arr) { sq += Math.pow(m-v,2) } return Math.pow(sq/arr.length, 0.5); }
const stochasticity = read => read.reduce((a,v)=>[v, a[0] !== v ? a[1] + 1 : a[1]], [read[0], 0])[1]/(read.length-1);
const intervals = poss => poss.reduce((a,v,i,arr)=>i===arr.length-1?a:a.concat(arr[i+1]-v), []);
const partial = arr => arr.length === 0 ? 0 : arr.filter(v=>v>0&&v<1).length/arr.length;
const readvar = arr => arr.length === 0 ? 0 : mean(arr.filter(v=>sum(v)>0).map(stochasticity));
const posvar = arr => arr.length === 0 ? 0 : stddev(arr[0].map((v,i)=>mean(acol(arr,i))));

const nucleotides = {A: "AWMRDHVN", C: "CYSMVHBN", T: "TYKWDHBN", G: "GRKSVDBN"};
const ntmap = {A: "T", C: "G", T: "A", G: "C"};
const revcomp = str => str.split('').map(v=>ntmap[v]).reverse().join('');
const c_patterns = Object.keys(nucleotides).reduce((a, first) => Object.assign(a, Object.keys(nucleotides).reduce((a, second) => Object.assign(a, {["C"+first+second]: nucleotides[first].split('').reduce((a, first) => a.concat(nucleotides[second].split('').map(second => "C"+first+second)), [])}), {})), {});
const g_patterns = Object.keys(c_patterns).reduce((a,v) => Object.assign(a, {[revcomp(v)]: c_patterns[v]}), {});

const matchPatterns = (seq, patterns) => {
	const filtered = [Object.keys(c_patterns).reduce((a,v) => Object.assign(a, {[v]: c_patterns[v].filter(pat => patterns.includes(pat))}), {}), Object.keys(g_patterns).reduce((a,v) => Object.assign(a, {[v]: g_patterns[v].filter(pat => patterns.includes(pat))}), {})];
	return new Uint8Array(seq.length).reduce((a,v,i)=>(seq[i] === "C" ? a.concat([seq[+(i)+1] === "G" ? ["CG", i, 0] : filtered[0][seq.substring(i, +(i)+3)] && filtered[0][seq.substring(i, +(i)+3)].length !== 0 ? [filtered[0][seq.substring(i, +(i)+3)][0], i, 0] : []]) : seq[i] === "G" ? a.concat([seq[+(i)-1] === "C" ? ["CG", i, 1] : filtered[1][seq.substring(i-2, +(i)+1)] && filtered[1][seq.substring(i-2, +(i)+1)].length !== 0 ? [filtered[1][seq.substring(i-2, +(i)+1)][0], i, 1] : []]) : a), []).filter(v=>v.length>0);
};

const gcContent = seq => {
	return seq === "" ? 0.5 : seq.split('').reduce((a,v)=>a+(v==="C"||v==="G"||v==="c"||v==="g"?1:0), 0) / seq.length;
};

const getTrackLabels = track_ids => new Promise((resolve, reject) => {
	const redis = require('redis').createClient();
	track_ids.reduce((a,v)=>a.hget("track:"+v, "label"), redis.multi()).exec((err, labels) => {
		redis.quit();
		if (err)
			return reject();
		resolve(labels);
	});
});

const collectElements = (env, options) => {
	const {ts} = require('./streams');
	const types = options.type.split(',');
	return new Promise((resolve, reject) => {
		const elements = [];
		require('fs').createReadStream(env.config.base_dir+'/annotations/'+options.annotation+'.json')
			.pipe(ts([line => {
				const element = JSON.parse(line);
				if (types.includes(element[0]))
					elements.push(element); // TODO: change to pipe
			}])).on('finish', () => resolve(elements));
	});
};

const defineRegions = (env, options, element) => {
	return new Promise((resolve, reject) => {
		require('./genome').seq(env, options.ref, element[1], element[2]).then(seq => {
			const cache = [[], []];
			const regions = [];
			const patterns = options.pattern.split(',');
			matchPatterns(seq, patterns).filter(v=>patterns.includes(v[0])).forEach(v => {
				if (cache[v[2]].length === 0)
					cache[v[2]].push(v[1]);
				else if (cache[v[2]].length > 0 && v[1] - cache[v[2]][0] < options.maxspan) {
					cache[v[2]].push(v[1]);
					if (cache[v[2]].length === options.positions)
						regions.push([v[2], cache[v[2]].slice(0), cache[v[2]][cache[v[2]].length-1] - cache[v[2]][0]]);
				} else {
					cache[v[2]].length = 0;
					cache[v[2]].push(v[1]);
				}
			});
			resolve(regions);
		});
	});
};

const readsFromTracks = (env, options, element, pattern_pos, track_ids, tracks) => Promise.all(track_ids.map(track => new Promise((resolve, reject) => {
	require('./track').load(env, track, element[1], element[2]).then(reads => {
		const readdata = [];
		for (const read of reads) {
			const rpos = read[0] - element[1];
			const context_pos = pattern_pos[read[1]].filter(v=>v>=rpos&&v<rpos+read[2]).map(v=>v-rpos);
			const cm_pos = read[4].filter(v=>context_pos.includes(v));
			const readvector = context_pos.map(v=>read[4].includes(v)?1:0);
			if (cm_pos.length >= options.minreadcs)
				readdata.push([context_pos.length, cm_pos.length, round(mean(intervals(context_pos)), 3), round(mean(intervals(cm_pos)), 3), round(stochasticity(readvector), 3)]);
		}
		resolve(readdata);
	});
})));

const regionsFromTracks = (env, options, element, regions, track_ids, tracks) => Promise.all(track_ids.map(track => new Promise((resolve, reject) => {
	require('./track').load(env, track, element[1], element[2]).then(reads => {
		const track_regions = regions.map(region => {
			const readvectors = [];
			const methyl = [];
			const methyl_counts = new Array(region[1].length+1).fill(0);
			for (const read of reads) {
				const rpos = read[0] - element[1];
				if (read[1] !== region[0] || rpos + read[2] < region[1][0])
					continue;
				if (rpos > region[1][region[1].length-1])
					break;
				const cm_pos = region[1].map(cpos=>read[4]&&read[4].includes(cpos-rpos)?1:0);
				const summed = sum(cm_pos);
				if (summed < options.minreadcs)
					continue;
				readvectors.push(cm_pos);
				methyl.push(summed/cm_pos.length);
				methyl_counts[summed] += 1;
			}
			if (options.analysis_type === "region_reads")
				return [region[1][0], region[2], readvectors.map(v=>[round(mean(v), 3), round(stochasticity(v), 3)])];
			else {
				const methyl_proportions = methyl_counts.map(v=>v/readvectors.length);
				return [region[1][0], region[2], methyl.length, mean(methyl), stddev(methyl), partial(methyl), readvar(readvectors), posvar(readvectors), ...methyl_proportions].map(v=>round(v, 3));
			}
		}).filter(v=>options.analysis_type === "region_reads" || (v[2]>=options.minreads && v[3]>=options.minmethyl));
		resolve(track_regions);
	});
})));

const customElement = (env, id, options, stats) => {
	return new Promise(async (resolve, reject) => {
		const [start, end] = options.region.split('-').map(v=>+(v));
		console.log([start, end]);
		const element = ["custom", start, end-start];
		const filename = env.config.base_dir+'/analyses/'+id;
		const track_ids = Array.isArray(options.tracks) ? options.tracks : options.tracks.toString().split(',').map(v=>+(v));
		const patterns = options.pattern.split(',');
		if (options.analysis_type === "reads") {
			const seq = await require('./genome').seq(env, options.ref, start, end-start);
			const seq_patterns = matchPatterns(seq, patterns).filter(v=>patterns.includes(v[0]));
			const pattern_pos = [0, 1].map(strand => seq_patterns.filter(v=>v[2]===strand).map(v=>v[1]));
			const tracks = await readsFromTracks(env, options, element, pattern_pos, track_ids, options.tracks);
			require('fs').writeFile(filename, JSON.stringify(element.concat([tracks]))+'\n', (err) => {
				if (err)
					reject(new Error(env.logger("Error writing to file: "+e)));
				save(env, id, options, filename).then(resolve).catch(reject);
			});
		} else {
			const regions = await defineRegions(env, options, element);
			const tracks = await regionsFromTracks(env, options, element, regions, track_ids, options.tracks);
			require('fs').writeFile(filename, JSON.stringify(element.concat([tracks]))+'\n', (err) => {
				if (err)
					reject(new Error(env.logger("Error writing to file: "+e)));
				save(env, id, options, filename).then(resolve).catch(reject);
			});
		}
	});
};

const annotation = (env, id, options, stats) => {
	return new Promise(async (resolve, reject) => {
		collectElements(env, options).then(elements => {
			stats.update("total", elements.length);
			const track_ids = Array.isArray(options.tracks) ? options.tracks : options.tracks.toString().split(',').map(v=>+(v));
			const filename = env.config.base_dir+'/analyses/'+id;
			const fs = require('fs');
			const write = require('util').promisify(fs.write);
			fs.open(filename, 'w', async (err, fd) => {
				if (err)
					return reject(new Error(env.logger("Cannot open analyses file for writing")));
				for (const element of elements) {
					stats.update("processed");
					if (options.analysis_type === "reads") {
						const patterns = options.pattern.split(',');
						const seq = await require('./genome').seq(env, options.ref, element[1], element[2]);
						const seq_patterns = matchPatterns(seq, patterns).filter(v=>patterns.includes(v[0]));
						const pattern_pos = [0, 1].map(strand => seq_patterns.filter(v=>v[2]===strand).map(v=>v[1]));
						const tracks = await readsFromTracks(env, options, element, pattern_pos, track_ids, options.tracks);
						if (sum(tracks.map(v=>v.length)) === 0)
							continue;
						try {
							await write(fd, JSON.stringify(element.concat([tracks]))+'\n');
						} catch (e) {
							return reject(new Error(env.logger("Error writing to file: "+e)));
						}
						stats.update("matched");
					} else {
						const regions = await defineRegions(env, options, element);
						if (regions.length === 0)
							continue;
						const tracks = await regionsFromTracks(env, options, element, regions, track_ids, options.tracks);
						if (sum(tracks.map(v=>v.length)) === 0)
							continue;
						try {
							await write(fd, JSON.stringify(element.concat([tracks]))+'\n');
						} catch (e) {
							return reject(new Error(env.logger("Error writing to file: "+e)));
						}
						stats.update("matched");
					}
				}
				fs.close(fd, err => err ? env.logger("Could not close file descriptor: "+err) : 1);
				save(env, id, options, filename).then(resolve).catch(reject);
			});
		});
	});
};

const save = (env, id, options, filename) => new Promise((resolve, reject) => {
	const redis = require('redis').createClient();
	redis.multi()
		.hmset("analysis:"+id, Object.assign(options, {analysis_id: id}))
		.lpush("analyses", id)
		.exec(err => {
			redis.quit();
			if (err)
				env.logger("Could not save analysis data to redis: "+err);
		});
	require('child_process').exec('gzip '+filename, err => {
		if (err)
			return reject(new Error(env.logger("Could not compress analysis data")));
		resolve();
	});
});

const load = (env, analysis_id) => {
	return new Promise((resolve, reject) => {
		const redis = require('redis').createClient();
		redis.hget('analysis:'+analysis_id, "analysis_id", (err, res) => {
			redis.quit();
			if (err)
				reject(new Error("Could not find analysis"));
			resolve(env.config.base_dir+'/analyses/'+analysis_id+'.gz');
		});
	});
};

const exportAnalysisCSV = (env, options, track_ids, labels) => new Promise((resolve, reject) => {
	const fs = require('fs');
	const { ts } = require('./streams');
	const pubfile = "/analyses/analysis_"+options.analysis_id+".csv";
	const outfile = env.config.base_dir+pubfile;
	try {
		fs.accessSync(outfile);
		return resolve({file: pubfile, metadata: options});
	} catch (e) {
		env.logger("Creating analysis CSV file");
	}
	const cols = ["sample", "element_type", "position", "length", "strand", "ID", "category", "subcategory", "region_pos", "region_length", "region_reads", "region_mean", "region_stddev", "region_partial", "region_readvar", "region_posvar", ...Array.from(Array(+(options.positions)+1)).map((v,i)=>"prop_"+i)];
	const filled = new Array(+(options.positions) + 8).fill(0);
	fs.createReadStream(env.config.base_dir+"/analyses/"+options.analysis_id+".gz")
		.pipe(require('zlib').createGunzip()).pipe(ts([line => {
			try {
				const data = JSON.parse(line);
				const out = data[5].map((track, track_id) => {
					return track.map(region => [labels[track_ids[track_id]], data.slice(0, 4), ...Array.from(Array(3)).map((v,i)=>data[4][i]?data[4][i][1]:""), ...region].join(',')).join('\n');
				});
				return (cols.length > 0 ? cols.splice(0, cols.length).join(',')+'\n' : '') + out.filter(v=>v!=="").join('\n');
			} catch (e) {
				return false;
			}
		}]))
		.pipe(fs.createWriteStream(outfile))
		.on("finish", () => resolve({file: pubfile, metadata: options}));
});

const exportAnalysisJSON = (env, options, track_ids, labels) => new Promise((resolve, reject) => {
	const fs = require('fs');
	const pubfile = "/analyses/analysis_"+options.analysis_id+".json";
	const outfile = env.config.base_dir+pubfile;
	try {
		fs.accessSync(outfile);
		return resolve({file: pubfile, metadata: options});
	} catch (e) {
		env.logger("Creating analysis JSON file");
	}
	const headers = ["## JSON structure: [element type, position, length, strand, [element metadata], [regions/reads by sample] ]",
	"## Samples: "+track_ids.map(v=>labels[v]).join(',')];
	const headers_text = headers.join('\n')+'\n';
	fs.writeFileSync(outfile, headers_text);
	fs.createReadStream(env.config.base_dir+"/analyses/"+options.analysis_id+".gz")
		.pipe(require('zlib').createGunzip())
		.pipe(fs.createWriteStream(outfile, {flags: "r+", start: headers_text.length}))
		.on("finish", () => resolve({file: pubfile, metadata: options}));
});

const exportAnalysis = (env, analysis_id, format="csv") => {
	return new Promise((resolve, reject) => {
		const redis = require('redis').createClient();
		redis.hgetall('analysis:'+analysis_id, (err, analysis) => {
			if (err) {
				redis.quit();
				return reject(new Error("Could not find analysis"));
			}
			const track_ids = analysis.tracks.split(',');
			track_ids.reduce((a,v)=>a.hget("track:"+v, "label"), redis.multi()).exec((err, _labels) => {
				redis.quit();
				if (err)
					return reject(new Error("Could not find tracks"));
				const labels = _labels.reduce((a,v,i)=>Object.assign(a, {[track_ids[i]]:v}), {});
				const fn = analysis.analysis_type === "region_features" && format === "csv" ? exportAnalysisCSV : exportAnalysisJSON;
				fn(env, analysis, track_ids, labels).then(resolve).catch(reject);
			});
		});
	});
};

const add = (env, _options) => {
	const defaults = {"analysis_type": "region_features", "minmethyl": 0.1, "minreadcs": 0, "minreads": 4};
	const options = Object.assign(defaults, _options);
	const redis = require('redis').createClient();
	redis.incr("analysis_id", async (err, id) => {
		redis.quit();
		if (err) {
			env.logger("Redis error: "+err);
			return env.res.json({error: "Failed to connect to Redis"});
		}
		try {
			options.track_labels = (await getTrackLabels(options.tracks.toString().split(','))).join(',');
		} catch (e) {
			env.logger(e);
			options.track_labels = "";
		}
		const stats = require('./stats')(env, "analysis", id, {total: 0, processed: 0, matched: 0}, options);
		(options.region && options.region !== "" ? customElement : annotation)(env, id, options, stats).then(() => {
			stats.end();
		}).catch(e => {
			stats.end("error");
			env.logger(e);
		});
		env.res.json({analysis_id: id});
	});
};

module.exports = {add, load, export: exportAnalysis}
