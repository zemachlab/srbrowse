"use strict";

const { ts, rs } = require('./streams');

const enline = (arr, sep=[",", ";"], i=0) => arr.map(v=>Array.isArray(v)?enline(v,sep,i+1):v).join(sep[i]);
const splice = (l, r) => read => [read[0], read[1].slice(l, read[1].length-r), read[2], read[3].slice(l, read[3].length-r)];
const convert = (str, rep) => read => [read[0], read[1].replace(new RegExp(str, 'g'), rep), read[2], read[3]];
const arr_comp = (arr1, arr2) => arr1.length !== arr2.length ? false : arr1.reduce((a,v,i)=>a&&arr1[i]===arr2[i], true);
const randint = (a, b) => a + Math.floor(Math.random()*(b-a));

const aligners = {
	bowtie2: (stats, assembly_index, options) => {
		const penalties = {gap: [20,10], mismatch: [2,2], amb: 10};
		const minscore = options['mismatches']*penalties['mismatch'][0]*-1;
		const bwt = require('child_process').spawn("bowtie2", ['-q', '--no-head', '--norc', '--mp', penalties['mismatch'].join(','), '--np', penalties['amb'], '--rdg', penalties['gap'].join(','), '--rfg', penalties['gap'].join(','), '-k', (options['maxmmap']+2), '--score-min', 'L,'+minscore+',0', '--quiet', '--threads', options['threads'], '-x', assembly_index, '-U', '-']);
		bwt.stderr.on('data', data=>stats.logger("bowtie error: "+data.toString()));
		bwt.stdin.on('error', data=>stats.logger("bowtie stdin error: "+data.toString()));
		return bwt;
	}
};

const sanitize = (stats, options) => {
	const last = [];
	const max_duplicates = options['deduplicate'] !== undefined || isNaN(options['deduplicate']) ? +(options['deduplicate']) : 0;
	return ts([line => {
		const parts = line.split(',').slice(0, 4);
		if (arr_comp(last.slice(1, 5), parts)) {
			last[0] += 1;
			stats.update("duplicates");
		} else {
			last.length = 0;
			last.push(1, ...parts);
		}
		if (max_duplicates !== 0 && last[0] > max_duplicates)
			return false;
		else
			return line;
	}]);
};

const indexReads = (stats, filename, density=5000) => {
	let cb = 0;
	let ci = 1;
	const out = {0:cb};
	return ts([line => {
		const pos = +(line.split(',')[0]);
		if (Math.floor(pos / density) >= ci) {
			ci = Math.floor(pos / density);
			if (out[ci-1] !== cb)
				out[ci] = cb;
		}
		cb += line.length + 1;
		stats.update("reads");
		return line;
	}]).on('finish', () => {
		require('fs').writeFile(filename+".idx", JSON.stringify({density: density, idx: out}), err => {
			if (err)
				stats.logger("Failed to create index file: "+err);
		});
	});
};

const processAlignerOutput = (stats, position_fn, readcache, options, conversion="ct", feature="C") => {
	const mmappers = [];
	return ts([line => {
		const out = [];
		const parts = line.split(/[\t]+/).map(v=>!isNaN(v)&&v!==null?+(v):v);
		if (mmappers.length > 0 && parts[1] !== 256) {
			if (mmappers.length - 2 <= options['maxmmap']) {
				stats.update("aligned");
				stats.update("mmappers");
				if (options['mh_resolve'] === 0)
					out.push(mmappers[randint(1, mmappers.length)]);
				else {
					for (const mmapper of mmappers.slice(1))
						out.push(mmapper);
				}
			}
			mmappers.length = 0;
		}
		if (parts[1] === 0) {
			stats.update("processed");
			const id = parts[0].replace(/@([^\s\t\r\n]+).*/, '$1');
			if (readcache[id] === undefined)
				return false;
			const seq = readcache[id].split('');
			delete readcache[id];
			const seqname = parts[2].toString();
			const _strand = seqname.match(/^rev_/) ? 1 : 0;
			const strand = conversion === "ga" ? (_strand === 1 ? 0 : 1) : _strand; // Switched - check
			const pos = position_fn(seqname.replace(/^rev_/, ''), parts[3], _strand, parts[9].length);
			const features = (_strand === 1 ? seq.reverse() : seq).reduce((a,v,i)=>a.concat(v===feature?[i]:[]),[]);
			const alignment = enline([pos, strand, parts[9].length, features.length, features]);
			if (parts[12].match(/^XS/)) {
				mmappers.push(seq.join(''), alignment);
			} else {
				stats.update("aligned");
				out.push(alignment);
			}
		} else if (parts[1] === 256) {
			if (!mmappers[0])
				return;
			const seq = mmappers[0].split('');
			const seqname = parts[2].toString();
			const _strand = seqname.match(/^rev_/) ? 1 : 0;
			const strand = conversion === "ga" ? (_strand === 1 ? 0 : 1) : _strand; // Switched - check
			const pos = position_fn(seqname.replace(/^rev_/, ''), parts[3], _strand, parts[9].length);
			const features = (_strand === 1 ? seq.reverse() : seq).reduce((a,v,i)=>a.concat(v===feature?[i]:[]),[]);
			mmappers.push(enline([pos, strand, parts[9].length, features.length, features]));
		} else {
			stats.update("processed");
			const id = parts[0].replace(/@([^\s\t\r\n]+).*/, '$1');
			if (readcache[id] !== undefined)
				delete readcache[id];
		}
		return out.length > 0 ? out.join('\n') : false;
	}]);
};

const getRefPos = (env, genome) => new Promise((resolve, reject) => {
	require('fs').readFile(env.config.base_dir+"/genomes/"+genome+"/genome.idx", (err, res) => {
		if (err)
			return reject("Unable to load genome index file: "+err);
		try {
			const position_fn = require('./genome').getPositionFunction(JSON.parse(res.toString()));
			resolve(position_fn);
		} catch (e) {
			reject(e);
		}
	});
});

const extReq = (url, args) => new Promise((resolve, reject) => {
	const https = require('https');
	const chunks = [];
	https.get(url+"?"+require('querystring').stringify(args), res => {
		res.on('data', data => {
			chunks.push(data.toString());
		});
		res.on('end', () => {
			try {
				const out = JSON.parse(chunks.join(''));
				resolve(out);
			} catch (e) {
				reject("Failed to load data from api");
			}
		});
	});
});

const getReadsInput = (env, options) => new Promise((resolve, reject) => {
	const runs = options['runs'].split(' ');
	switch (options['download_method']) {
		case "fastqdump": {
			const proc = require('child_process').spawn('fastq-dump', ['--split-spot', '--skip-technical', '-Z', ...runs]);
			proc.on('error', e => env.logger(e.toString()));
			proc.stderr.on('data', data => env.logger(data.toString()));
			resolve(options['layout'] === "paired" ? [proc.stdout, proc.stdout] : [proc.stdout]);
			break;
		}
		case "ebi": {
			const api_url = "https://www.ebi.ac.uk/ena/portal/api/filereport";
			Promise.all(runs.map(accession => extReq(api_url, {accession: accession, result: "read_run", fields: "fastq_ftp,fastq_md5,fastq_bytes,read_count", format: "JSON"}))).then(res => {
				const ftp_urls = Array.from(new Array(options['layout'] === "paired" ? 2 : 1)).map(v=>[]);
				res.forEach(item=>item.forEach(v=>v['fastq_ftp'].split(';').forEach((v,i)=>ftp_urls[i].push(v))));
				const out = ftp_urls.map(urls => {
					const wget = require('child_process').spawn("wget", ["-qO-", ...urls]);
					wget.stderr.on('data', data => env.logger(data.toString()));
					wget.on('error', e => env.logger(e.toString()));
					return wget.stdout.pipe(require('zlib').createGunzip());
				});
				resolve(out);
			});
			break;
		}
	}
});

const bseqAlign = async (env, track_id, _options) => {
	const defaults = {"aligner": "bowtie2", "threads": 2};
	const options = Object.assign(defaults, _options);
	const stats = require('./stats')(env, "track", track_id, {total: options['layout'] === "paired" ? options['reads'] * 2 : options['reads'], processed: 0, aligned: 0, duplicates: 0, reads: 0, mmappers: 0}, options);
	const position_fn = await getRefPos(env, options['reference_assembly']);
	const track_file = env.config.base_dir+'/tracks/'+track_id;
	const unsorted_output = require('fs').createWriteStream(track_file+'.unsorted');
	const reads_input = await getReadsInput(env, options);
	Promise.all(reads_input.map((reads, i)=> {
		const readcache = {};
		const aligner_output = aligners[options['aligner']](stats, env.config.base_dir+"/genomes/"+options['reference_assembly']+"/genome."+(+(i) === 1 ? 'ga' : 'ct'), options, 1);
		reads.pipe(ts([convert(...(+(i) === 1 ? ['G', 'A'] : ['C', 'T']))], "string", 4))
			.pipe(aligner_output.stdin);
		reads.pipe(rs([parts => {
			const id = parts[0].replace(/@([^\s\t\r\n]+).*/, '$1');
			readcache[id] = parts[1];
		}], 4));
		return new Promise((resolve, reject) => {
			aligner_output.stdout.pipe(processAlignerOutput(stats, position_fn, readcache, options, ...(+(i) === 1 ? ["ga", "G"] : ["ct", "C"]))).on('end', resolve).pipe(unsorted_output, {end: false});
		});
	})).then(() => {
		unsorted_output.end();
		stats.milestone("aligned");
		require('child_process').spawn('sort', ['-t,', '-k1,1n', track_file+'.unsorted']).stdout
			.pipe(sanitize(stats, options))
			.pipe(indexReads(stats, track_file+'.reads'))
			.pipe(require('fs').createWriteStream(track_file+'.reads'))
			.on('finish', () => {
				require('child_process').exec('rm '+track_file+'.unsorted');
			});
	});
};

module.exports = { bseq: bseqAlign };
