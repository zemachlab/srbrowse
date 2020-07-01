"use strict";

addHooks([
	['select[name=genome]', 'change', e => filterByParams({ref: e.target.value})],
	['[data-remove-analysis]', 'click', e => {
		confirmBox('Removing all track data', () => {
			const id = e.target.dataset.removeTrack;
			apiReq({f: 'remove', type: "track", id}).then(res => {
				if (res['error'])
					return showError(res['error']);
				e.target.closest('.tr').remove();
			});
		});
	}],
	['[data-export-analysis]', 'click', e => {
		const id = e.target.dataset.id;
		const format = e.target.dataset.exportAnalysis;
		apiReq({f: 'exportAnalysis', analysis_id: id, format}).then(data => {
			const { file, metadata } = data;
			window.location.href = file;
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
	apiReq({f: 'query', index: 'analyses', prefix: 'analysis:'}).then(_data => {
		const data = _data.filter(v=>Object.keys(params).reduce((a,k)=>a&&(params[k] === "" || params[k] === v[k]), true));
		const cols = ["tracks", "ref", "analysis_type", "type", "pattern", "maxspan", "positions"];
		const labels = ["tracks", "ref", "analysis_type", "type", "pattern", "maxspan", "positions"];
		document.querySelector('.analyses-data').innerHTML = data.length === 0 ? '<p>There are currently no analyses to display</p>' : '<div class="table"><div class="th">'+labels.map(v=>'<div class="td td-7">'+v+'</div>').join('')+'</div>'+data.map(v=>'<div class="tr"><div class="td td-7"><a data-export-analysis="csv" data-id="'+v['analysis_id']+'" data-icon="f" title="Export"></a> <span class="track-labels" title="'+(v['track_labels'] ? v['track_labels'] : v['tracks']).split(',').join('&#010;')+'">'+(v['track_labels'] ? v['track_labels'] : v['tracks']).split(',')[0]+((v['track_labels'] ? v['track_labels'] : v['tracks']).split(',').length > 1 ? ' <a data-icon="m"></a>' : '')+'</span></div>'+cols.slice(1).map(_v=>'<div class="td td-7" data-type="'+_v+'">'+v[_v]+'</div>').join('')+'</div>').join('')+'</div>';
	});
};

window.addEventListener('load', () => {
	apiReq({f: 'query', index: 'genome:*'}).then(data => {
		document.querySelector('select[name=genome]').innerHTML += data.map(v=>'<option value="'+v['label']+'">'+v['label']+'</option>').join('');
	});
	filterByParams();
});

