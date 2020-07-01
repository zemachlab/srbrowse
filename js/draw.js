"use strict";

const draw = {
	rect: (svg, x, y, width, height, elemClass="", dataset={}, prepend) => {
		const elem = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		elem.setAttribute('x', x);
		elem.setAttribute('y', y);
		elem.setAttribute('width', width);
		elem.setAttribute('height', height);
		Object.keys(dataset).forEach(k => elem.setAttribute('data-'+k, dataset[k]));
		if (elemClass !== "")
			elem.setAttribute('class', elemClass);
		prepend && svg.children.length > 0 ? svg.insertBefore(elem, svg.children[0]) : svg.appendChild(elem);
		return elem;
	},
	circle: (svg, x, y, r, style, text="") => {
		const elem = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		elem.setAttribute('cx', x);
		elem.setAttribute('cy', y);
		elem.setAttribute('r', r);
		elem.setAttribute('style', style);
		if (text !== "")
			elem.setAttribute('data-info', text);
		svg.appendChild(elem);
		return elem;
	},
	polyline: (svg, x, y, style, text="") => {
		const elem = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
		elem.setAttribute('points', Array.from(Array(x.length)).map((v,i)=>[x[i], y[i]].join(',')).join(' '));
		elem.setAttribute('style', style);
		if (text !== "")
			elem.setAttribute('data-info', text);
		svg.appendChild(elem);
		return elem;
	},
	polygon: (svg, points, style, text="") => {
		const elem = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
		elem.setAttribute('points', points.map(v=>v.join(',')).join(' '));
		elem.setAttribute('style', style);
		if (text !== "")
			elem.setAttribute('data-info', text);
		svg.appendChild(elem);
		return elem;
	},
	text: (svg, x, y, elemClass, text) => {
		const elem = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		elem.setAttribute('x', x);
		elem.setAttribute('y', y);
		elem.setAttribute('class', elemClass);
		elem.innerHTML = text;
		svg.appendChild(elem);
		return elem;
	},
	grid: (svg, x, y, width, height, n) => {
		for (let i=1;i<n[0];i++)
			draw.rect(svg, x, y+i*height/n[0], width, 1, "grid_line");
		for (let i=1;i<n[1];i++)
			draw.rect(svg, x+i*width/n[1], y, 1, height, "grid_line");
	},
};
