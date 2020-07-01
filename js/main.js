"use strict";

const round = (n,p) => { var f = Math.pow(10, p); return Math.round(n * f) / f };

if (!Element.prototype.matches)
	Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;

if (!Element.prototype.closest) {
	Element.prototype.closest = function(s) {
		let el = this;
		if (!document.documentElement.contains(el)) return null;
		do {
			if (el.matches(s)) return el;
			el = el.parentElement || el.parentNode;
		} while (el !== null && el.nodeType === 1);
		return null;
	};
}

const toggleElem = function (elem, state=0) {
	const element = document.querySelector(elem);
	if (element === null)
		return;
	if (state !== 2 && (element.style.display !== "block" || state === 1)) {
		element.style.display = "block";
	} else {
		element.style.display = "none";
	}
};

const encodeVars = function (vars, arg="") {
	const out = [];
	if (Array.isArray(vars) && vars.length === 0)
		return arg+"[]=";
	for (const v in vars) {
		if (typeof vars[v] === 'object')
			out.push(encodeVars(vars[v], arg === "" ? v : arg+"["+encodeURIComponent(v)+"]"));
		else
			out.push((arg !== "" ? arg+"["+ encodeURIComponent(v)+"]" : encodeURIComponent(v))+"="+encodeURIComponent(vars[v]));
	}
	return out.join("&");
};

const apiReq = function (args, url='/api', format='json') {
	return new Promise((resolve, reject) => {
		const req = new XMLHttpRequest();
		req.onreadystatechange = () => {
			if (req.readyState !== XMLHttpRequest.DONE)
				return;
			if (req.status !== 200)
				return resolve(null);
			const data = format === 'json' ? JSON.parse(req.responseText) : req.responseText;
			resolve(data);
		}
		req.open("GET", url+"?"+encodeVars(args), true);
		req.send();
	});
};

const eventHooks = {};

const addHooks = (hooks) => {
	for (const hook of hooks) {
		const [elem, event, fn] = hook;
		if (eventHooks[event] !== undefined)
			eventHooks[event].push([elem, fn]);
		else {
			eventHooks[event] = [[elem, fn]];
			document.addEventListener(event, runHooks);
		}
	}
};

const runHooks = (e) => {
	if (eventHooks[e.type] !== undefined) {
		for (const hook of eventHooks[e.type]) {
			if (e.target.matches(hook[0])) {
				const r = hook[1](e);
				if (r === false)
					break;
			}
		}
	}
};

const formError = (form, error) => {
	const elem = document.createElement('div');
	elem.innerHTML = '<a class="fright">Close</a>'+error;
	form.querySelector('.errors').appendChild(elem);
};

const confirmBox = (message, confirm) => {
	showHover('<p>'+message+'</p><div><a class="button confirm-button">Confirm</a> <a class="button" onclick="hideHover()">Cancel</a></div>', true);
	document.querySelector('#hover .confirm-button').addEventListener('click', e => { confirm(e); hideHover() }, {once: true});
};

const showHover = (html, small=false) => {
	const hover = document.querySelector('#hover');
	if (html !== undefined)
		hover.innerHTML = html;
	hover.style.display="block";
	small ? hover.setAttribute('class', 'small') : hover.setAttribute('class', '');
	document.querySelector('#darkbox').style.display="block";
};

function hideHover () {
	document.querySelector('#hover').style.display="none";
	document.querySelector('#darkbox').style.display="none";
};

addHooks([
	['.notify-button', 'click', e => toggleElem('.notify-menu')],
	['.notify-menu [data-id] .name, .notify-menu [data-id] [data-progress]', 'click', e => {
		const process = e.target.closest('[data-id]');
		if (document.querySelectorAll('[data-full-stats="'+process.dataset.id+'"]').length === 0) {
			const elem = document.createElement('div');
			elem.dataset.fullStats = process.dataset.id;
			elem.innerHTML = `<div><div class="name">Processed</div><div data-type="processed">0</div></div>
<div><div class="name">Rate</div><div data-type="rate">0</div></div>
<div><div class="name">ETA</div><div data-type="remaining">0</div></div>`;
			process.appendChild(elem);
			toggleElem('[data-full-stats="'+process.dataset.id+'"]');
		} else
			toggleElem('[data-full-stats="'+process.dataset.id+'"]');
	}],
]);

const socket = io();
const updates = {};

// TODO: move code into function
socket.on('process', data => {
	const { id, type, stage, stats } = data;
	if (stage === "complete") {
		document.querySelector('.notify-menu [data-id="'+id+'"]').remove();
		document.querySelector('.notify-button').dataset.processes = document.querySelectorAll('.notify-menu [data-id]').length;
		console.log(data);
		return;
	}
	if (document.querySelectorAll('.notify-menu [data-id="'+id+'"]').length === 0) {
		const elem = document.createElement('div');
		elem.innerHTML = '<div class="name">'+data['id']+'</div><div class="progress"><div class="progress-bar"></div></div>';
		elem.dataset.id = id;
		document.querySelector('.notify-menu').appendChild(elem);
		document.querySelector('.notify-button').dataset.processes = document.querySelectorAll('.notify-menu [data-id]').length;
	}
	const progress = document.querySelector('.notify-menu [data-id="'+id+'"] .progress');
	const pc = Math.round(10000 * stats.processed / stats.total)/100;
	const pc2 = Math.round(10000 * (type === "analysis" ? stats.matched : stats.aligned) / stats.processed)/100;
	progress.querySelector('.progress-bar').style.width = pc + '%';
	progress.dataset.progress = pc + '% ('+pc2+'%)';
	if (updates[id] === undefined)
		updates[id] = [];
	updates[id].push([stats.processed, new Date().getTime()]);
	if (updates[id].length > 25)
		updates[id].shift();
	if (updates[id].length === 1)
		return;
	const change = updates[id][updates[id].length-1][0] - updates[id][0][0];
	const period = updates[id][updates[id].length-1][1] - updates[id][0][1];
	if (change === 0 || period === 0)
		return;
	if (document.querySelectorAll('[data-full-stats="'+id+'"]').length === 1) {
		const elapsed = new Date().getTime() - data['start'];
		const rate = Math.round(change/(period/1000));
		const eta = Math.round((stats.total - stats.processed) / rate);
		stats.rate = rate+' elements/sec';
		stats.remaining = Math.floor(eta/3600)+'h'+Math.floor((eta%3600)/60)+'m'+((eta%3600)%60)+'s';
		Object.keys(stats).forEach(stat => {
			document.querySelectorAll('[data-full-stats="'+id+'"] [data-type="'+stat+'"]').forEach(v=>v.innerHTML=stats[stat]);
		});
	}
});

