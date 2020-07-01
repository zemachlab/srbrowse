"use strict";

const { ts, rs } = require('./streams');
const cumsum = arr => { let sum = 0; const out = []; for (const v of arr) { sum += v; out.push(sum) } return out; }

const _ntmap = {
	index:  'acgtwsmkrybdhvn',
	fa:     'acgtwsmkrybdhvn',
	flat:   'acgtwsmkrybdhvn',
	ct_fw:  'atgtwkwkrtkdwdn',
	ct_rev: 'tgtawkkwtrdwdyn',
	ga_fw:  'acatwmmwayhwhmn',
	ga_rev: 'tacawmwmyamhwhn',
	rev:    'tgcawskmyrvhdbn'
};
const ntmap = Object.keys(_ntmap).slice(1).reduce((a,v)=>Object.assign(a, {[v]:_ntmap[v].split('').reduce((a,v,i)=>Object.assign(a, {[_ntmap['index'][i]]:v.toUpperCase(),[_ntmap['index'][i].toUpperCase()]:v.toUpperCase()}),{})}),{});

const aligners = {
	bowtie2build: (logger, filename) => {
		return new Promise((resolve, reject) => {
			const build = require('child_process').spawn("bowtie2-build", [filename, filename])
				.stderr.on('data', data => logger("bowtie2-build error: "+data))
				.on('error', reject)
				.on('close', resolve);
		});
	}
};

const getSequence = (env, ref, pos, span) => {
	return new Promise((resolve, reject) => {
		const fs = require('fs');
		fs.open(env.config.base_dir+"/genomes/"+ref+"/genome.flat", 'r', (err, fd) => {
			if (err)
				return reject("Failed to read genome sequence: "+err);
			fs.read(fd, Buffer.alloc(span), 0, span, pos-1, function (err, bytesRead, out) {
				if (err)
					reject("Failed to read genome sequence: "+err);
				else
					resolve(out.toString());
				fs.close(fd, err => {});
			});
		});
	});
};

const getPositionFunction = (chrsize) => {
	const chrs = Object.keys(chrsize);
	const chrpos = cumsum([0, ...Object.values(chrsize)]).reduce((a,v,i)=>Object.assign(a, {[chrs[i]]:v}),{});
	return (sequence, pos, strand, readlength) => {
		if (chrsize[sequence] === undefined) {
			console.log("Failed to find index for "+sequence);
			return 0;
		}
		const size = chrsize[sequence];
		const rpos = strand === 1 ? size - pos - readlength + 2 : pos;
		return chrpos[sequence] + rpos;
	}
};

const concatFiles = (env, files, output) => {
	return new Promise((resolve, reject) => {
		const exec = require('child_process').exec;
		exec(["cat", ...files, ">", output].join(" "), err => {
			if (!err) {
				exec("rm "+files.join(' '));
				resolve(output);
			} else {
				env.logger(err);
				reject(err);
			}
		});
	});
};

const indexChrs = (env, dir, label, assembly_fasta) => {
	return new Promise((resolve, reject) => {
		const idx = {0: 0};
		let chr = "";
		assembly_fasta.pipe(rs([line => {
			if (line[0] === '>') {
				chr = line.replace(/^\>([^ ]+).*?$/, "$1");
				idx[chr] = 0;
			} else {
				idx[chr] += line.length;
			}
		}]).on('finish', () => {
			require('fs').writeFile(dir+"/genome.idx", JSON.stringify(idx), (err, res) => {
				if (err)
					return reject("Could not create genome index file");
				const redis = require('redis').createClient();
				redis.hmset('genome:'+label, "idx", JSON.stringify(idx), "size", Object.values(idx).reduce((a,v)=>a+v, 0), (err, res) => {
					if (err)
						env.logger(err);
					redis.quit();
					resolve();
				});
			});
		}));
	});
};

const convertAssembly = (env, dir, assembly_fasta) => {
	return new Promise((resolve, reject) => {
		Promise.all(['fa', 'flat', 'ct_fw', 'ct_rev', 'ga_fw', 'ga_rev'].map(conversion => {
			return new Promise ((resolve, reject) => {
				let init = 1;
				assembly_fasta.pipe(ts([line => {
					if (line[0] === '>') {
						if (conversion !== "flat") {
							const out = (init !== 1 || conversion.match(/_rev/) ? "\n" : "")+(conversion.match(/_rev/) ? (">rev_"+line.substring(1)).split('').reverse().join('') : line)+"\n";
							if (init === 1)
								init = 0;
							return out;
						} else
							return false;
					} else {
						const lineout = [];
						for (let i=0;i<line.length;i++)
							lineout.push(ntmap[conversion][line[i]]);
						return lineout.join('');
					}
				}], "flat")).pipe(require('fs').createWriteStream(dir+"/genome."+conversion))
					.on('finish', () => resolve());
			});
		})).then(() => {
			const exec = require('child_process').exec;
			Promise.all([['ct', 'ct_fw', 'ct_rev'], ['ga', 'ga_fw', 'ga_rev']].map(ext => new Promise((resolve, reject) => {
				exec("cat "+dir+"/genome."+ext[2]+" | rev > "+dir+"/genome."+ext[2]+".rev", err => {
					if (err)
						return reject(new Error(env.logger("Failed to build converted genomes: "+err)));
					exec("rm "+dir+"/genome."+ext[2]);
					concatFiles(env, [dir+"/genome."+ext[1], dir+"/genome."+ext[2]+".rev"], dir+"/genome."+ext[0])
						.then(filename => aligners.bowtie2build(env.logger, filename, env.config.cpus ? Math.max(Math.round(env.config.cpus / 2), 1) : 1))
						.then(resolve)
						.catch(e => reject(new Error(env.logger("Failed to build converted genome indexes: "+e))));
				});
			}))).then(resolve).catch(reject);
		});
	});
};

const addAssembly = (env, label, assembly_url, annotation, overwrite=true) => {
	return new Promise((resolve, reject) => {
		const fs = require('fs');
		const dir = env.config.base_dir+"/genomes/"+label;
		fs.mkdir(dir, err => {
			if (err && err['code'] !== 'EEXIST')
				return reject(new Error("Cannot create genome directory"));
			fs.access(dir+'/genome.flat', err => { // TODO: change to stats to check file length
				if (!err && !overwrite)
					return reject(new Error("Genome already added"));
				const redis = require('redis').createClient();
				redis.multi()
					.hset('genome:'+label, "label", label)
					.lpush('genomes', label)
					.exec(err => redis.quit());
				const local = !assembly_url.match(/^(ftp|http)/);
				const source = local ? fs.createReadStream(assembly_url) : require('child_process').spawn('wget', ['-qO-', assembly_url]).stdout;
				Promise.all([
					indexChrs(env, dir, label, source),
					convertAssembly(env, dir, source)
				]).then(resolve).catch(reject);
			});
		});
	});
};

const loadAnnotation = (env, label, pos, span, filter = ["chromosome"], search="") => {
	const padding = 50000;
	return new Promise((resolve, reject) => {
		env.cache.retrieve("annotation", label).then(data => {
			const region = [Math.max(pos-padding, 0), Math.max(+(pos) + +(span) + padding, 0)];
			const idx_pos = [Math.floor(region[0]/data['density']), Math.ceil(region[1]/data['density'])];
			const bp = [data['idx'][Math.max(idx_pos[0] - 1, 0)], data['idx'][Math.max(idx_pos[1] - 1, 1)]];
			if (bp[0] >= bp[1])
				return resolve([]);
			const elements = [];
			require('fs').createReadStream(env.config.base_dir+"/annotations/"+label+".json", {start: bp[0], end: bp[1]}).pipe(rs([line => {
				const element = JSON.parse(line);
				if (filter.includes(element[0]) || element[1] + element[2] < pos)
					return;
				if (search !== "") {
					if (element[1] > pos && element[4].filter(v=>v[1]&&v[1].match(search)).length > 0)
						elements.push(element);
				} else {
					if (element[1] > pos + span)
						return;
					elements.push(element);
				}
			}])).on('finish', () => {
				resolve(elements);
			});
		});
	});
};

const indexAnnotation = (env, filename, density=50000) => {
	let cb = 0;
	let ci = 1;
	const out = {0:cb};
	return ts([line => {
		const data = JSON.parse(line);
		const pos = data[1];
		if (Math.floor(pos / density) >= ci) {
			ci = Math.floor(pos / density);
			if (out[ci-1] !== cb)
				out[ci] = cb;
		}
		cb += line.length + 1;
		return line;
	}]).on('finish', () => {
		require('fs').writeFile(filename+".idx", JSON.stringify({density: density, idx: out}), err => {
			if (err)
				env.logger("Failed to create index file: "+err);
		});
	});
};

const addAnnotation = (env, reference_assembly, annotation_file) => {
	const label = annotation_file.replace(/^.*?([^\/\.]+)[^\/]*?$/, "$1");
	const filename = env.config.base_dir+"/annotations/"+label+".json";
	return new Promise((resolve, reject) => {
		const redis = require('redis').createClient();
		redis.sadd('annotations:'+reference_assembly, label, (err, res) => {
			if (res === 0) {
				redis.quit();
				return reject(new Error("Annotation already exists"));
			}
			const readfile = require('util').promisify(require('fs').readFile);
			Promise.all(["genome.idx", "synonyms.idx"].map(v=>readfile(env.config.base_dir+"/genomes/"+reference_assembly+"/"+v))).then(([chr_idx, chr_synonyms]) => {
				const idx = JSON.parse(chr_idx);
				const synonyms = JSON.parse(chr_synonyms);
				const chrs = Object.keys(idx);
				const chrpos = [0, ...cumsum(Object.values(idx))];
				const write = require('util').promisify(require('fs').appendFile);
				require('child_process').spawn('sort', ['-k1,1', '-k4,4n', annotation_file]).stdout.pipe(ts([line => {
					const [_chr, source, type, start, end, , strand, , meta] = line.split(/\t/);
					if (meta === undefined)
						return false;
					const chr = chrs.indexOf(_chr) !== -1 ? chrs.indexOf(_chr) : chrs.indexOf(synonyms[_chr]);
					if (chr === -1)
						return false;
					const pos = chrpos[chr] + +(start);
					return JSON.stringify([type, pos, end - start, strand === "-" ? 1 : 0, meta.split(';').map(v=>v.split('='))]);
				}]))
				.pipe(indexAnnotation(env, filename))
				.pipe(require('fs').createWriteStream(filename))
				.on('finish', () => {
					if (err) {
						env.logger(err);
						reject(new Error("Failed to save annotation"));
					}
					resolve(label);
				});
			}).catch(err => {
				env.logger(err);
				reject(new Error("Failed to load genome index"));
			});
		});
	});
};

module.exports = { addAssembly, addAnnotation, getPositionFunction, seq: getSequence, loadAnnotation }
