"use strict";

const acol = (arr,col) => arr.map(v=>v[col]);
const range = (a, b) => Array.from(new Array(Math.floor(b-a))).map((v,i)=>a+i);
const unique = arr => Object.keys(arr.reduce((a,v)=>Object.assign(a, {[v]: 1}), {}));
const sum = arr => arr.reduce((a,v)=>a+v, 0);
const mean = arr => arr.length === 0 ? 0 : arr.reduce((a,v)=>a+v, 0)/arr.length;
const stochasticity = read => read.reduce((a,v)=>[v, a[0] !== v ? a[1] + 1 : a[1]], [read[0], 0])[1]/(read.length-1);
const cumsum = arr => { let sum = 0; const out = []; for (const v of arr) { sum += v; out.push(sum) } return out; }
const stddev = arr => { if (arr.length === 0) return 0; const m = mean(arr); let sq = 0; for (const v of arr) { sq += Math.pow(m-v,2) } return Math.pow(sq/arr.length, 0.5); }
const inconsistence = read => read.reduce((a,v)=>[v, a[0] !== v ? a[1] + 1 : a[1]], [read[0], 0])[1]/(read.length-1);
const readvar = arr => arr.length === 0 ? 0 : mean(arr.filter(v=>sum(v)>0).map(inconsistence));
const posvar = arr => arr.length === 0 ? 0 : stddev(arr[0].map((v,i)=>mean(acol(arr,i))));

const data_labels = {"mean": "mean region methylation", "stddev": "read methylation sd.", "posvar": "among-site sd.", "readvar": "stochasticity", "enzyme": "enzyme score", "zero": "zero-methylated reads", "fully": "fully methylated reads", "methylation": "methylation", "reads": "reads", "selected_reads": "selected reads"};

const nucleotides = {A: "AWMRDHVN", C: "CYSMVHBN", T: "TYKWDHBN", G: "GRKSVDBN"};
const ntmap = {A: "T", C: "G", T: "A", G: "C"};
const revcomp = str => str.split('').map(v=>ntmap[v]).reverse().join('');
const c_patterns = Object.keys(nucleotides).reduce((a, first) => Object.assign(a, Object.keys(nucleotides).reduce((a, second) => Object.assign(a, {["C"+first+second]: nucleotides[first].split('').reduce((a, first) => a.concat(nucleotides[second].split('').map(second => "C"+first+second)), [])}), {})), {});
const g_patterns = Object.keys(c_patterns).reduce((a,v) => Object.assign(a, {[revcomp(v)]: c_patterns[v]}), {});

const matchPatterns = (seq, patterns) => {
	const filtered = [Object.keys(c_patterns).reduce((a,v) => Object.assign(a, {[v]: c_patterns[v].filter(pat => patterns.includes(pat))}), {}), Object.keys(g_patterns).reduce((a,v) => Object.assign(a, {[v]: g_patterns[v].filter(pat => patterns.includes(pat))}), {})];
	return new Uint8Array(seq.length).reduce((a,v,i)=>(seq[i] === "C" ? a.concat([seq[+(i)+1] === "G" ? ["CG", i, 0] : filtered[0][seq.substring(i, +(i)+3)] && filtered[0][seq.substring(i, +(i)+3)].length !== 0 ? [filtered[0][seq.substring(i, +(i)+3)][0], i, 0] : []]) : seq[i] === "G" ? a.concat([seq[+(i)-1] === "C" ? ["CG", i, 1] : filtered[1][seq.substring(i-2, +(i)+1)] && filtered[1][seq.substring(i-2, +(i)+1)].length !== 0 ? [filtered[1][seq.substring(i-2, +(i)+1)][0], i, 1] : []]) : a), []).filter(v=>v.length>0);
};

const seq_nav = {
	move: (_pos, _span) => {
		const pos = Math.max(Math.round(_pos / 25) * 25, 1);
		const span = Math.max(Math.round(_span / 50), 1) * 50;
		return [pos, span];
	},
	zoomout: (pos, _span, scale=1) => { // TODO: remove duplication
		const span = Math.max(_span < 100 ? 100 : _span < 1000 ? _span + scale * 100 : _span < 5000 ? _span + scale * 1000 : _span + scale * 2000, 50);
		return seq_nav.move(pos+(_span-span)/2, span);
	},
	zoomin: (pos, _span, scale=1) => {
		const span = Math.max(_span <= 1000 ? _span - scale * 100 : _span < 5000 ? _span - scale * 500 : _span - scale * 1000, 50);
		return seq_nav.move(pos+(_span-span)/2, span);
	},
	moveright: (pos, span, scale=1) => {
		return seq_nav.move(pos + Math.max(span * scale * 0.2, 25), span);
	},
	moveleft: (pos, span, scale=1) => {
		return seq_nav.move(pos - Math.max(span * scale * 0.2, 25), span);
	},
	moveright2: (pos, span) => seq_nav.moveright(pos, span, 5),
	moveleft2: (pos, span) => seq_nav.moveleft(pos, span, 5),
};

addHooks([
	['select[name=genome]', 'change', e => loadAssemblyData(e.target.value)],
	['select[name=display]', 'change', e => {
		updateHash({display: e.target.value});
	}],
	['.data-list [data-id]', 'click', e => {
		if (!e.target.classList.contains('selected'))
			e.target.classList.add('selected');
		else
			e.target.classList.remove('selected');
		const container = e.target.parentNode;
		updateHash({[container.dataset.type]: Array.from(container.querySelectorAll('[data-id].selected')).map(v=>v.dataset.id)});
	}],
	['[data-action]', 'click', e => {
		const args = argsFromHash();
		const [pos, span] = seq_nav[e.target.dataset.action](args.pos, args.span);
		updatePosition(pos, span);
	}],
	['.moveto-button', 'click', e => {
		const args = argsFromHash();
		const pos_args = Array.from(e.target.closest('.pos-form').querySelectorAll('[name]')).reduce((a,v)=>Object.assign(a, {[v.getAttribute('name')]:v.value}), {});
		const chr = +(pos_args['chr'].split(':')[1]);
		const pos = chr + +(pos_args['pos']);
		updatePosition(pos, args.span);
	}],
	['.annotation-search', 'click', e => {
		const search = document.querySelector('[name="annotation_search"]').value;
		if (search.length < 3)
			return;
		const args = argsFromHash();
		if (args.annotations.length === 0)
			return;
		apiReq({f: 'annotations', annotations: args.annotations, pos: args.pos, span: args.span, search: search}).then(res => {
			for (const annotation in res['annotations']) {
				if (res['annotations'][annotation].length === 0)
					continue;
				const pos = res['annotations'][annotation][0][1];
				updatePosition({pos, span: args.span});
				break;
			}
		});
	}],
	['.add-annotation', 'click', e => {
		showHover('<form><a class="fright" onclick="hideHover()">Close</a><h2>Add annotation</h2><div class="errors"></div><input type="hidden" name="reference_assembly" value="'+document.querySelector('.browser').dataset.genome+'"><p><label>Annotation file</label><input type="text" name="annotation_file" placeholder="Annotation (GFF) file path" value=""></p><div class="fright"><a class="submit-annotation button">Add</a></div></form>');
	}],
	['.submit-annotation', 'click', e => {
		hideHover();
		const form = e.target.closest('form');
		const options = Array.from(form.querySelectorAll('[name]')).reduce((a,v)=>Object.assign(a, {[v.getAttribute('name')]: v.value}), {});
		apiReq(Object.assign({f: 'addAnnotation'}, options)).then(res => {
			if (res['error'] !== undefined)
				return;
			const annotation = document.createElement("div");
			annotation.dataset.id = res['label'];
			annotation.innerHTML = res['label'];
			document.querySelector('.data-list[data-type="annotations"]').appendChild(annotation);
		});
	}],
	['rect[data-pos]', 'click', e => {
		Array.from(document.querySelectorAll('rect[data-pos="'+e.target.dataset.pos+'"]')).forEach(elem=>elem.classList.toggle("selected"));
		const sites = Array.from(document.querySelectorAll('rect.selected')).map(v=>v.dataset.pos);
		updateHash({sites: unique(sites)});
	}],
	['[data-text]', 'mouseover', e => {
		const text = '<h3>'+e.target.dataset.type+'</h3>'+e.target.dataset.text.split(';').map(v=>`<p>${v}</p>`).join('');
		showTooltip(text, e.clientX, e.clientY);
	}],
	['[data-text]', 'mouseout', e => {
		hideTooltip();
	}],
	['.browser-settings', 'click', e => {
		document.querySelector('.settings.dropdown').classList.toggle("show");
	}],
	['[data-change]', 'click', e => {
		const {type, change} = e.target.dataset;
		const args = argsFromHash();
		updateHash({[type]: (args[type] + +(change))});
	}],
	['[data-value]', 'keyup', e => {
		if (e.keyCode !== 13)
			return;
		updateHash({[e.target.dataset.value]: +(e.target.value)});
	}],
	['rect.annotation', 'click', e => {
		const type = e.target.dataset.type;
		analysisForm(type);
	}],
	['.analysis-button', 'click', e => {
		analysisForm();
	}],
	['.submit-analysis', 'click', e => {
		const args = argsFromHash();
		const form = e.target.closest('form');
		const options = Array.from(form.querySelectorAll('[name]')).reduce((a,v)=>Object.assign(a, {[v.getAttribute('name')]: v.value}), {ref: args.genome, tracks: args.tracks});
		apiReq(Object.assign({f: 'addAnalysis'}, options));
		hideHover();
	}],
	['rect.track', 'click', e => {
		const id = e.target.dataset.id;
		const svg = e.target.closest('svg');
		const rpos = e.clientX - e.target.getBoundingClientRect().x;
		const args = argsFromHash();
		const ypos = id * (args.th + args.tm);
		if (!e.target.classList.contains("focused")) {
			svg.querySelectorAll('.selector').forEach(item => item.remove());
			draw.rect(svg, rpos, ypos, 1, args.th, "selector", {id, start: rpos}, true);
		} else {
			const cwidth = svg.dataset.width/args.span;
			const [pos, span] = [Math.round(args.pos + document.querySelector('.selector[data-id="'+id+'"]').getAttribute('x')/cwidth), Math.round(document.querySelector('.selector[data-id="'+id+'"]').getAttribute('width')/cwidth)];
			const tooltip_menu = `<a class="region-zoom" data-pos="${pos}" data-span="${span}">Zoom to region</a><a class="region-analysis" data-pos="${pos}" data-span="${span}">Analyse region</a>`;
			showTooltip(tooltip_menu, e.clientX, e.clientY);
		}
		e.target.classList.toggle("focused");
	}],
	['.region-zoom', 'click', e => {
		const {pos, span} = e.target.dataset;
		document.querySelectorAll('svg .selector').forEach(item => item.remove());
		updatePosition(...seq_nav.move(+(pos), +(span)));
		hideTooltip();
	}],
	['.region-analysis', 'click', e => {
		const {pos, span} = e.target.dataset;
		document.querySelectorAll('svg .selector').forEach(item => item.remove());
		analysisForm(undefined, pos, span);
		hideTooltip();
	}],
	['rect.track.focused', 'mousemove', e => {
		const id = e.target.dataset.id;
		const rpos = e.clientX - e.target.getBoundingClientRect().x;
		const x = +(document.querySelector('.selector[data-id="'+id+'"]').dataset.start);
		const width = rpos-x;
		if (width < 0) {
			document.querySelector('.selector[data-id="'+id+'"]').setAttribute('x', x+width);
			document.querySelector('.selector[data-id="'+id+'"]').setAttribute('width', -width);
		} else
			document.querySelector('.selector[data-id="'+id+'"]').setAttribute('width', width);
	}],
]);

const loadAssemblyData = (genome) => {
	return new Promise((resolve, reject) => {
		document.querySelector('.browser').dataset.genome = genome;
		apiReq({f: 'init', ref: genome}).then(data => {
			document.querySelector('.data-list[data-type="tracks"]').innerHTML = data['tracks'].map(v=>'<div data-id="'+v['track_id']+'">'+v['label']+'</div>').join('');
			document.querySelector('.data-list[data-type="annotations"]').innerHTML = data['annotations'].map(v=>'<div data-id="'+v+'">'+v+'</div>').join('');
			const chrsize = JSON.parse(data['genome'].idx);
			const idx = cumsum(Object.values(chrsize));
			document.querySelector('.browser [name=chr]').innerHTML = Object.keys(chrsize).slice(1).map((v,i)=>'<option value="'+v+':'+idx[i]+'">'+v+'</option>').join('');
			resolve();
		});
	});
};

const updatePosition = (pos, span) => {
	const browser = document.querySelector('.browser');
	const chrs = Array.from(browser.querySelector('[name="chr"]').childNodes).reduce((a,v)=>Object.assign(a, {[v.value]: +(v.value.split(':')[1])}), {});
	const chr = Object.keys(chrs).reduce((a,v,i,arr)=>a!==""?a:pos<chrs[v]?arr[i-1]:a, "");
	const rpos = pos - chrs[chr];
	browser.querySelector('[name="chr"]').value=chr;
	browser.querySelector('[name="pos"]').value=rpos;
	updateHash({pos, span});
};

const refreshBrowser = (args) => {
	const browser = document.querySelector('.browser');
	const svg = browser.querySelector('svg');
	Array.from(document.querySelectorAll('[data-value]')).forEach(item => args[item.dataset.value] !== undefined ? item.value = args[item.dataset.value] : 0);
	const chrs = Array.from(browser.querySelector('[name="chr"]').childNodes).reduce((a,v)=>Object.assign(a, {[v.value]: +(v.value.split(':')[1])}), {});
	const chr = Object.keys(chrs).reduce((a,v,i,arr)=>a!==""?a:args.pos<chrs[v]?arr[i-1]:a, "");
	const chrpos = args.pos - chrs[chr];
	svg.setAttribute('width', browser.offsetWidth);
	svg.setAttribute('height', (args.th + args.tm) * (args.tracks.length + args.annotations.length));
	svg.dataset.width = browser.offsetWidth;
	svg.dataset.height = args.th * (args.tracks.length + args.annotations.length);
	while (svg.lastChild)
		svg.removeChild(svg.lastChild);
	apiReq({f: 'data', ref: args.genome, pos: args.pos, span: args.span, tracks: args.tracks, annotations: args.annotations}).then(data => {
		const [sequence, track_data, annotation_data] = data;
		const seq_patterns = matchPatterns(sequence, args.patterns).filter(v=>args.patterns.includes(v[0]));
		for (const i in args.tracks)
			drawTrack(args, svg, i, args.tracks[i], track_data[args.tracks[i]], sequence, seq_patterns, chrpos, args.pos, args.span, args.sites);
		for (const i in args.annotations)
			drawAnnotation(svg, args.pos, args.span, args.annotations[i], annotation_data[args.annotations[i]], i, (args.th + args.tm) * args.tracks.length);
		if (args.sites)
			args.sites.forEach(v=>Array.from(document.querySelectorAll('rect[data-pos="'+v+'"]')).forEach(elem => elem.classList.add("selected")));
	});
};

const analysisForm = (type = ":", pos=0, span=0) => {
	const analyses = ["region_features"]; //, "region_reads", "reads"];
	const analyses_labels = ["Features from regions", "Reads from regions", "All reads from elements"];
	showHover(`<form>
<a class="fright" onclick="hideHover()">Close</a><h2>New analysis</h2>
<div class="errors"></div>
${span === 0 ? `<p><label>Annotation</label><input type="text" name="annotation" placeholder="Annotation" value="${type.split(':')[0]}"></p>
<p><label>Element type</label><input type="text" name="type" placeholder="Element type" value="${type.split(':')[1]}"></p>` : ''}
${span > 0 ? `<p><label>Region</label><input type="text" name="region" placeholder="Region" value="${pos}-${+(pos) + +(span)}"></p>` : ''}
<p><label>Context</label><input type="text" name="pattern" placeholder="Pattern(s)" value="CHH"></p>
<p><label>Positions</label><input type="text" name="positions" value="5"></p>
<p><label>Max span</label><input type="text" name="maxspan" value="30"></p>
<p><label>Min. methylation</label><input type="text" name="minmethyl" value="0.1"></p>
<p><label>Min. read Cs</label><input type="text" name="minreadcs" value="0"></p>
<p><label>Analysis type</label><select name="analysis_type">${analyses.map((v,i)=>'<option value="'+v+'">'+analyses_labels[i]+'</option>')}</select></p>
<div class="fright"><a class="submit-analysis button">Add</a></div>
</form>`);
};

const showTooltip = (text, left, top) => {
	const dialog = document.querySelector('#tooltip');
	dialog.style.left = left+'px';
	dialog.style.top = top+20+'px';
	dialog.style.display='block';
	dialog.innerHTML = text;
};
const hideTooltip = () => document.querySelector('#tooltip').style.display='none';

const drawTrack = (args, svg, order, track_id, reads, sequence, seq_patterns, chrpos, pos, span, _selected) => {
	const display_style = _selected.length > 0 ? "selected_reads" : args.display;
	const cheight = (args.th-args.rh)/2;
	const ypos = order * (args.th + args.tm);
	const cwidth = svg.dataset.width / args.span;
	const readdims = [args.rh, 1];
	const tiern = Math.round(cheight/(readdims[0]+readdims[1]));
	const tiers = [Array.from(new Array(tiern)), Array.from(new Array(tiern))];
	const coverage = [new Uint16Array(span), new Uint16Array(span)];
	const features = new Uint16Array(span);
	const coverage_selected = [new Uint16Array(span), new Uint16Array(span)];
	const features_selected = new Uint16Array(span);
	const pattern_pos = seq_patterns.map(v=>v[1]);
	const selected = _selected.map(v=>v.split(':').map(v=>+(v)));
	const strand_selected = range(0, 2).map(v=>selected.filter(_v=>_v[0]===v).map(v=>v[1]));
	const filtered = reads.filter(v => strand_selected[v[1]].length > 0 && strand_selected[v[1]].reduce((a,_v)=>v[0]<=_v&&v[0]+v[2]>_v&&a, true)).sort((a,b)=>b[3]-a[3]);
	draw.rect(svg, 0, ypos, svg.dataset.width, args.th, "track", {id: order});
	draw.rect(svg, 0, ypos + cheight, svg.dataset.width, args.rh, "sequence");
	for (const read of reads) {
		// TODO: combine with below
		const [readpos, strand, readlength, , _cpos] = read;
		const rpos = readpos - pos;
		const cpos = _cpos.map(v=>rpos+v).filter(v=>pattern_pos.includes(v));
		for (let _pos=Math.max(rpos, 0);_pos<rpos+read[2];_pos++)
			coverage[read[1]][_pos] += 1;
		for (const feature of read[4])
			features[rpos+feature] += 1;
		if (display_style === "reads" && cpos.length >= args.ml)
			drawRead(svg, seq_patterns, pattern_pos, readdims, tiers, cwidth, ypos + cheight, [rpos, strand, readlength, cpos]);
	}
	for (const read of filtered) {
		const [readpos, strand, readlength, , _cpos] = read;
		const rpos = readpos - pos;
		const cpos = _cpos.map(v=>rpos+v).filter(v=>pattern_pos.includes(v));
		for (let _pos=Math.max(rpos, 0);_pos<rpos+read[2];_pos++)
			coverage_selected[read[1]][_pos] += 1;
		for (const feature of read[4])
			features_selected[rpos+feature] += 1;
		if (display_style === "selected_reads")
			drawRead(svg, seq_patterns, pattern_pos, readdims, tiers, cwidth, ypos + cheight, [rpos, strand, readlength, cpos]);
	}
	if (["mean", "stddev", "posvar", "readvar", "enzyme", "zero", "fully"].includes(display_style)) {
		//draw.text(svg, svg.dataset.width, ypos, "position right", 1);
		//draw.text(svg, svg.dataset.width, ypos+cheight*2, "position right bottom", 0);
		draw.grid(svg, 0, ypos, svg.dataset.width, cheight, [4, 20]);
		draw.grid(svg, 0, ypos+cheight+args.rh, svg.dataset.width, cheight, [4, 20]);
		const regions = defineRegions(seq_patterns, args.rsites, args.rspan);
		const features = collectReads(pos, regions, reads);
		for (const feature of features.filter(v=>v['mean']>=args.mm&&v['reads']>=args.mr)) {
			const signal = feature[display_style];
			if (signal > 0)
				draw.rect(svg, feature.pos[1] * cwidth, feature.pos[0] === 1 ? ypos + cheight + args.rh : ypos + (cheight * (1 - signal)), feature.pos[2]*cwidth, cheight * signal, "region", {type: "Region", text: Object.entries(feature).map(v=>`${data_labels[v[0]] !== undefined ? data_labels[v[0]] : v[0]}: ${!isNaN(v[1]) ? round(v[1], 3) : v[1]}`).join(';')});
		}
	} else {
		for (const matched of seq_patterns) {
			const [pattern, rpos, strand] = matched;
			draw.rect(svg, rpos * cwidth, ypos + cheight, cwidth, args.rh, "pattern-marker", {type: pattern});
		}
		if (display_style !== "reads") {
			for (const matched of seq_patterns) {
				const [pattern, rpos, strand] = matched;
				const partial = strand_selected[strand].includes(pos + rpos);
				const signal = partial ? (coverage_selected[strand][rpos] > 0 ? features_selected[rpos] / coverage_selected[strand][rpos] : 0) : (coverage[strand][rpos] > 0 ? features[rpos] / coverage[strand][rpos] : 0);
				if (signal > 0)
					draw.rect(svg, rpos * cwidth, strand === 1 ? ypos + cheight + args.rh : ypos + (cheight * (1 - signal)), cwidth, cheight * signal, "", {type: pattern, text: "Signal: "+round(signal,2)+";Coverage: "+(partial ? coverage_selected[strand][rpos] : coverage[strand][rpos])+";Position: "+(chrpos+rpos), pos: [strand, pos + rpos].join(':')});
			}
		}
	}
	draw.text(svg, 3, ypos+cheight+args.rh, "position", chrpos);
	draw.text(svg, svg.dataset.width - 3, ypos+cheight+args.rh, "position right", chrpos+span);
	const label = document.querySelector('[data-type="tracks"] [data-id="'+track_id+'"]').innerHTML;
	draw.text(svg, 3, ypos, "label", `${label} ${data_labels[display_style]}`);
};

const drawRead = (svg, seq_patterns, pattern_pos, readdims, tiers, cwidth, midpos, read) => {
	const [rpos, strand, readlength, cpos] = read;
	const free = tiers[strand].findIndex(v=>v===undefined||v<rpos);
	if (free !== -1) {
		tiers[strand][free] = rpos + readlength;
		const y = midpos + ((free+1)*(strand === 1 ? 1 : -1))*(readdims[0]+readdims[1])
		draw.rect(svg, rpos * cwidth, y, readlength * cwidth, readdims[0], "read");
		for (const _cpos of cpos)
			draw.rect(svg, _cpos * cwidth, y, cwidth, readdims[0], "feature", {type: seq_patterns[pattern_pos.indexOf(_cpos)][0]});
	}
};

const drawAnnotation = (svg, pos, span, annotation, elements, order, startat=0, hidden=["protein", "CDS", "mRNA"]) => {
	const height = 40;
	const padding = 10;
	const cheight = height/2;
	const ypos = startat + cheight + order * (height + 20 + padding) + 20;
	const cwidth = svg.dataset.width / span;
	for (const element of elements) {
		if (hidden.includes(element[0]))
			continue;
		const dims = [(element[1]-pos) * cwidth, ypos - cheight/2 + padding, element[2] * cwidth, cheight];
		draw.rect(svg, ...dims, "annotation", {type: annotation+":"+element[0], text: element[4].map(v=>v.join(":")).join(';')});
		if (dims[2] < 20)
			continue;
		const mid = dims[0]+dims[2]/2;
		if (element[3] === 0)
			draw.polygon(svg, [[mid-5, dims[1]+5], [mid+5, dims[1]+10], [mid-5, dims[1]+15], [mid-5, dims[1]+5]], "fill:#fff;");
		else
			draw.polygon(svg, [[mid+5, dims[1]+5], [mid-5, dims[1]+10], [mid+5, dims[1]+15], [mid+5, dims[1]+5]], "fill:#fff;");
	}
	draw.text(svg, 3, ypos - cheight, "label", annotation);
};

const defineRegions = (patterns, sites=5, maxspan=30) => {
	const regions = [];
	const cache = [[], []];
	patterns.forEach(v => {
		if (cache[v[2]].length === 0)
			cache[v[2]].push(v[1]);
		else if (cache[v[2]].length > 0 && v[1] - cache[v[2]][0] < maxspan) {
			cache[v[2]].push(v[1]);
			if (cache[v[2]].length === sites)
				regions.push([v[2], cache[v[2]].slice(0), cache[v[2]][cache[v[2]].length-1] - cache[v[2]][0]]);
		} else {
			cache[v[2]].length = 0;
			cache[v[2]].push(v[1]);
		}
	});
	return regions;
};

const collectReads = (pos, regions, reads) => {
	const analysis = (reads) => {
		const sums = reads.map(v=>mean(v));
		const features = {reads: reads.length, mean: mean(sums), stddev: stddev(sums), posvar: posvar(reads), readvar: readvar(reads), zero: sums.filter(v=>v===0).length/sums.length, fully: sums.filter(v=>v===1).length/sums.length};
		features['enzyme'] = Math.min(Math.max((1.184-2.412*features.stddev+0.673*features.readvar+1.776*features.posvar)/2, 0), 1);
		return features;
	};
	return regions.map(region => {
		const readvectors = [];
		for (const read of reads) {
			const [readpos, strand, readlength, , _cpos] = read;
			const rpos = readpos - pos;
			if (strand !== region[0] || rpos+readlength < region[1][0])
				continue;
			if (rpos > region[1][region[1].length-1])
				break;
			const cpos = _cpos.map(v=>rpos+v);
			readvectors.push(region[1].map(v=>cpos.includes(v) ? 1 : 0));
		}
		return Object.assign({pos: [region[0], region[1][0], region[2]]}, analysis(readvectors));
	});
};

const argsFromHash = (_args = {}) => {
	const defaults = {
		genome: document.querySelector('select[name=genome]').value,
		pos: 1,
		span: 5000,
		display: "methylation",
		ml: 0,
		mm: 0.05,
		mr: 4,
		rspan: 30,
		rsites: 5,
		th: 100,
		tm: 20,
		rh: 5,
		tracks: [],
		annotations: [],
		sites: [],
		patterns: ["CG", "CHG", "CHH"],
	};
	const args = window.location.hash.substring(1).split('&').reduce((a, _v) => {
		const [i, v] = _v.split('=');
		return Object.assign(a, {[i]: Array.isArray(defaults[i]) ? (v === '' ? [] : v.split(',')) : !isNaN(v) ? +(v) : v});
	}, defaults);
	return Object.assign(args, _args);
};

const loadFromHash = () => {
	const args = argsFromHash();
	loadAssemblyData(args['genome']).then(() => {
		args['tracks'].forEach(v=>document.querySelector('.data-list[data-type="tracks"] [data-id="'+v+'"]').classList.add("selected"));
		args['annotations'].forEach(v=>document.querySelector('.data-list[data-type="annotations"] [data-id="'+v+'"]').classList.add("selected"));
		args['patterns'].forEach(v=>document.querySelector('.data-list[data-type="patterns"] [data-id="'+v+'"]').classList.add("selected"));
		refreshBrowser(args);
	});
};

const updateHash = (_args) => {
	const args = argsFromHash(_args);
	const hash = Object.entries(args).map(v=>`${v[0]}=${Array.isArray(v[1]) ? v[1].join(',') : v[1]}`).join('&');
	window.location.hash = hash;
	refreshBrowser(args);
};

window.addEventListener('load', () => {
	apiReq({f: 'query', index: 'genome:*'}).then(data => {
		document.querySelector('select[name=genome]').innerHTML = data.map(v=>'<option value="'+v['label']+'">'+v['label']+'</option>').join('');
		loadFromHash();
	});
});
