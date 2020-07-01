"use strict";

const decodeXml = (str) => str.replace(/(&quot;|&lt;|&gt;|&amp;)/g, (s, i) => { return {'&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>'}[i] });

const templates = {
	add_track: `<form>
<a class="fright" onclick="hideHover()">Close</a>
<h2>Add dataset</h2>
<div class="errors"></div>
<p><label>Label</label><input type="text" name="label" placeholder="Track label" value=""></p>
<p><label>Source</label><select name="source"><option value="local">Local file</option><option value="SRA">NCBI SRA</option></select></p>
<div data-source="local">
<p><label>Source data</label><select name="local"><option value="single_fastq">Single-end FASTQ</option><option value="paired_fastq">Paired-ends FASTQ</option><option value="SAM">Aligned SAM/BAM</option></select></p>
<div data-local="single_fastq">
<p><label>Single-ends FASTQ</label><input type="text" name="fastq" placeholder="FASTQ file path" value=""></p>
</div>
<div data-local="paired_fastq" style="display:none">
<p><label>Left-pair FASTQ</label><input type="text" name="fastq_left" placeholder="Left-pair FASTQ file path" value=""></p>
<p><label>Right-pair FASTQ</label><input type="text" name="fastq_right" placeholder="Right-pair FASTQ file path" value=""></p>
</div>
<div data-local="SAM" style="display:none">
<p><label>SAM/BAM file</label><input type="text" name="aligned_reads" placeholder="SAM/BAM file path"></p>
</div>
<div class="fright"><a class="check-files button">Next</a></div>
</div>
<div data-source="SRA" style="display:none">
<p><label>Download method</label><select name="download_method"><option value="ebi">EBI ftp</option><option value="fastqdump">Fastqdump</option></select></p>
<p><label>Search query</label><input type="filename" name="sra_term" placeholder="Query"><a class="button small fright search-sra">Search</a></p>
<div class="sra-results"></div>
</div>
</form>`,
	alignment_options: `<input type="hidden" name="runs" value="">
<input type="hidden" name="reads" value="0">
<p><label>Reference assembly</label><select name="reference_assembly"></select></p>
<p><label>Layout</label><select name="layout"><option value="single">Single ends</option><option value="paired">Paired ends</option></select></p>
<p><label>Splice left (0=none)</label><input type="text" name="splice_left" placeholder="Splice left" value="0"></p>
<p><label>Splice right (0=none)</label><input type="text" name="splice_right" placeholder="Splice right" value="0"></p>
<p><label>Maximum mismatches</label><input type="text" name="mismatches" placeholder="Mismatches" value="0"></p>
<p><label>Maximum duplicates</label><input type="text" name="deduplicate" placeholder="Duplicates (0 = no limit)" value="1"></p>
<p><label>Multimapping limit</label><input type="text" name="maxmmap" placeholder="Maximum additional hits" value="0"></p>
<p><label>Distribute multimappers</label><select name="mh_resolve"><option value="0">Select random hit</option><option value="0">Select best alignment</option><option value="1">Show all hits</select></p>
<a class="fright button add-track">Add track</a>`,
	add_assembly: `<form>
<a class="fright" onclick="hideHover()">Close</a>
<h2>Add assembly</h2>
<p><label>Label</label><input type="text" name="label" placeholder="Assembly label" value=""></p>
<p><label>Assembly FASTA</label><input type="text" name="assembly_url" placeholder="URL of assembly" value=""></p>
<a class="fright button add-assembly">Add assembly</a>
</form>`,
	combine_tracks: `<form>
<a class="fright" onclick="hideHover()">Close</a>
<h2>Combine tracks</h2>
<p><label>Label</label><input type="text" name="label" placeholder="Track label" value=""></p>
<p><label>Tracks</label><input type="text" name="tracks" placeholder="Track IDs" value=""></p>
</div>
<a class="fright button combine-tracks">Combine</a>
</form>`};

const ncbiSRASearch = (query, limit=200) => new Promise((resolve, reject) => {
		document.querySelectorAll('.search-form [name]').forEach(v => {
			args[v.getAttribute('name')] = v.value;
		});
		apiReq({term: query, db: "SRA", retmode: "json", retmax: limit}, "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi").then(res => {
			if (res === null || res['esearchresult']['ERROR'] !== undefined)
				return resolve([]);
			const uids = res['esearchresult']['idlist'];
			apiReq({db: "SRA", retmode: "json", "id": uids.join(',')}, "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi").then(res => {
				if (res === null || res['error'] !== undefined)
					return resolve([]);
				const results = res['result'];
				const out = Object.keys(results).filter(v=>v!=="uids").map(uid => {
					const content = document.createElement('div');
					content.innerHTML = decodeXml(results[uid]['expxml'])+'<runs>'+decodeXml(results[uid]['runs'])+'</runs>';
					const item = {
						Study: content.querySelector('Study').getAttribute('name'),
						Sample: content.querySelector('Biosample').innerHTML,
						Experiment: content.querySelector('Title').innerHTML,
						Layout: content.querySelector('LIBRARY_LAYOUT').innerHTML.replace(/.*(single|paired).*/, "$1"),
						Reads: content.querySelector('Statistics').getAttribute('total_spots'),
						runs: []
					};
					content.querySelectorAll('Run').forEach(v => {
						item['runs'].push({
							accession: v.getAttribute('acc'),
							reads: +(v.getAttribute('total_spots')),
							bp: +(v.getAttribute('total_bases'))
						});
					});
					return item;
				});
				resolve(out);
			});
		});
	});

addHooks([
	['select[name=genome]', 'change', e => filterByParams({reference_assembly: e.target.value})],
	['[data-form]', 'click', e => {
		showHover(templates[e.target.dataset.form]);
	}],
	['form select[name]', 'change', e => {
		const form = e.target.closest('form');
		const name = e.target.getAttribute('name');
		form.querySelectorAll('[data-'+name+']').forEach(v=>v.style.display='none');
		form.querySelectorAll('[data-'+name+'="'+e.target.value+'"]').forEach(v=>v.style.display='block');
	}],
	['.search-sra', 'click', e => {
		const form = e.target.closest('form');
		const dataset = form.querySelector('[name=sra_term]').value;
		ncbiSRASearch(dataset).then(results => {
			const html = results.length === 0 ? "<p>No data matched your query</p>" : results.map(v=>'<div class="result" data-sample="runs:'+v['runs'].map(v=>v['accession']).join(' ')+',layout:'+v['Layout']+',reads:'+v['Reads']+'"><h3>'+v['Sample']+': '+v['Study']+'</h3><div class="information">'+["Sample", "Experiment", "Reads", "Layout"].map(_v=>'<div class="entry"><div class="name">'+_v+'</div><div class="details">'+v[_v]+'</div></div>').join('')+'</div><div class="runs">'+v['runs'].map(v=>'<div class="entry"><div class="name">'+v['accession']+'</div><div class="details">'+v['reads']+' reads, L='+(v['bp']/v['reads'])+'</div></div>').join('')+'</div><div class="clear fright"><a class="button add-sample">Add to library</a></div></div>').join('');
			document.querySelector('.sra-results').innerHTML = '<h2>Results</h2>'+html;
			document.querySelector('.sra-results').style.display='block';
		});
	}],
	['.check-files', 'click', e => {
		const form = e.target.closest('form');
		const type = document.querySelector('[name="local"]').value;
		const check = [];
		if (type === "single_fastq") {
			const file = document.querySelector('[name="fastq"]').value;
			if (file === "")
				return formError(form, "Please fill in file path");
			check.push(file);
		} else if (type === "paired_fastq") {
			const files = [document.querySelector('[name="fastq_left"]').value, document.querySelector('[name="fastq_left"]').value];
			if (!files.reduce((a,v)=>v!==""&&a,true))
				return formError(form, "Please fill in file paths");
			check.push(...files);
		} else if (type === "SAM") {
			const file = document.querySelector('[name="aligned_reads"]').value;
			if (file === "")
				return formError(form, "Please fill in file path");
			check.push(file);
		}
		apiReq({f: 'checkFiles', files: check}).catch(e => {
			formError(form, "Error checking files");
		}).then(data => {
			if (data['error'] !== undefined)
				return formError(form, data['error']);
			if (data.length === 0)
				return;
			const options = document.createElement('div');
			options.innerHTML = templates['alignment_options'];
			options.querySelector('[name="layout"]').value = type === "paired_fastq" ? "paired" : "single";
			options.querySelector('[name="reads"]').value = data[0]['reads'];
			apiReq({f: 'query', index: 'genome:*'}).then(data => options.querySelector('[name=reference_assembly]').innerHTML = data.map(v=>'<option value="'+v['label']+'">'+v['label']+'</option>').join(''));
			form.appendChild(options);
			e.target.remove();
		});
	}],
	['.add-sample', 'click', e => {
		const form = e.target.closest('form');
		form.querySelector('.sra-results').style.display='none';
		const data = e.target.closest('[data-sample]').dataset.sample.split(',');
		const options = document.createElement('div');
		options.innerHTML = templates['alignment_options'];
		apiReq({f: 'query', index: 'genome:*'}).then(data => options.querySelector('[name=reference_assembly]').innerHTML = data.map(v=>'<option value="'+v['label']+'">'+v['label']+'</option>').join(''));
		const runs = [];
		for (const _field of data) {
			const field = _field.split(':');
			if (field[0] === "runs")
				runs.push(...field[1].split(' '));
			options.querySelectorAll('[name="'+field[0]+'"]').forEach(v=>v.value = field[1]);
		}
		form.appendChild(options);
	}],
	['.add-track', 'click', e => {
		const form = e.target.closest('form');
		const options = Array.from(form.querySelectorAll('[name]')).reduce((a,v)=>Object.assign(a, {[v.getAttribute('name')]:v.value}),{});
		apiReq(Object.assign({f: 'addTrack'}, options));
		hideHover();
	}],
	['.combine-button', 'click', e => {
		const tracks = Array.from(document.querySelectorAll('input[type="checkbox"][data-type="track"]')).filter(v=>v.checked).map(v=>v.getAttribute('name')).join(',');
		showHover(templates.combine_tracks);
		document.querySelector('#hover [name="tracks"]').value=tracks;
	}],
	['.combine-tracks', 'click', e => {
		const form = e.target.closest('form');
		const options = Array.from(form.querySelectorAll('[name]')).reduce((a,v)=>Object.assign(a, {[v.getAttribute('name')]:v.value}),{});
		apiReq(Object.assign({f: 'combineTracks'}, options));
		hideHover();
	}],
	['[data-remove-track]', 'click', e => {
		confirmBox('Removing all track data', () => {
			const id = e.target.dataset.removeTrack;
			apiReq({f: 'remove', type: "track", id: id}).then(res => {
				if (res['error'])
					return showError(res['error']);
				e.target.closest('.tr').remove();
			});
		});
	}],
	['.add-assembly', 'click', e => {
		const form = e.target.closest('form');
		const options = Array.from(form.querySelectorAll('[name]')).reduce((a,v)=>Object.assign(a, {[v.getAttribute('name')]:v.value}),{});
		apiReq(Object.assign({f: 'addAssembly'}, options));
		hideHover();
	}],
]);

const filterByParams = (params = {}) => {
	apiReq({f: 'query', index: 'tracks', prefix: 'track:'}).then(_data => {
		const data = _data.filter(v=>Object.keys(params).reduce((a,k)=>a&&(params[k] === "" || params[k] === v[k]), true));
		const cols = ["label", "reference_assembly", "layout", "processed", "aligned", "duplicates"];
		const labels = ["Label", "Assembly", "Layout", "Processed", "Aligned", "Duplicates"];
		document.querySelector('.tracks-data').innerHTML = data.length === 0 ? '<p>There are currently no loaded datasets</p>' : '<div class="table"><div class="th">'+labels.map(v=>'<div class="td td-6">'+v+'</div>').join('')+'</div>'+data.map(v=>'<div class="tr"><div class="td td-6"><input type="checkbox" data-type="track" name="'+v['track_id']+'"> '+v['label']+' <a data-status="'+v['status']+'"></a> <a data-remove-track="'+v['track_id']+'">Del</a></div>'+cols.slice(1).map(_v=>'<div class="td td-6" data-type="'+_v+'">'+v[_v]+'</div>').join('')+'</div>').join('')+'</div>';
	});
};

window.addEventListener('load', () => {
	apiReq({f: 'query', index: 'genome:*'}).then(data => {
		const cols = ["label", "size"];
		document.querySelector('select[name=genome]').innerHTML += data.map(v=>'<option value="'+v['label']+'">'+v['label']+'</option>').join('');
		document.querySelector('.assembly-data').innerHTML = data.length === 0 ? '<p>There are currently no loaded assemblies</p>' : '<div class="table"><div class="th">'+cols.map(v=>'<div class="td td-2">'+v+'</div>').join('')+'</div>'+data.map(v=>'<div class="tr">'+cols.map(_v=>'<div class="td td-2" data-type="'+_v+'">'+v[_v]+'</div>').join('')+'</div>').join('');
	});
	filterByParams();
});



