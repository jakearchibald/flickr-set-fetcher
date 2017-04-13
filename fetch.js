const fs = require('fs-promise')
const request = require('request');
const util = require('util');
const url = require('url');
const path = require('path');

const configFile = fs.readFile(__dirname + '/config.json').then(data => JSON.parse(data));

function requestJson(url) {
	return new Promise((resolve, reject) => {
		request.get({url, json: true}, (err, response, data) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(data);
		})
	});
}

async function getImageUrls(config) {
	const perPage = 100;
	const baseUrl = "https://api.flickr.com/services/rest/?method=flickr.photosets.getPhotos&api_key=%s&photoset_id=%s&extras=url_o&per_page=" + perPage + "&page=%d&format=json&nojsoncallback=1";
	const imageUrls = [];
	let page = 1;

	while (true) {
		const data = await requestJson(util.format(baseUrl, config.apiKey, config.set, page));
		const urls = data.photoset.photo.map(p => p.url_o);
		imageUrls.push(...urls);

		if (imageUrls.length == data.photoset.total) break;
		page++;
	}

	return imageUrls;
}

function queue(tasks, {
	concurrentTasks = 10
}={}) {
	return new Promise((resolve, reject) => {
		let i = 0;
		let runningTasks = 0;
		
		async function nextTask() {
			const task = tasks[i];
			i++;

			if (!task) return;

			runningTasks++;
			
			try {
				await task();
			}
			catch (err) {
				reject(err);
				return;
			}

			runningTasks--;

			if (runningTasks == 0 && i == tasks.length) {
				resolve();
				return;
			}

			if (tasks[i]) nextTask();
		}

		for (let i = 0; i < concurrentTasks; i++) nextTask();
	})
}

function urlToFilename(u) {
	return url.parse(u).path.match(/[^\/]+$/)[0];
}

function saveUrl(u, destination) {
	return new Promise((resolve, reject) => {
		const filename = urlToFilename(u);
		console.log('Fetching', filename);

		request.get(u)
			.on('error', err => {
				console.log('Failed to fetch', filename, err);
				reject(err);
			})
			.on('end', () => {
				console.log('Fetched', filename);
				resolve();
			})
			.pipe(fs.createWriteStream(path.join(destination, filename), {mode: 0600}));
	});
}

async function deleteUnexpectedFiles(imageUrls, dir) {
	const expectedFiles = imageUrls.map(u => urlToFilename(u));
	const files = await fs.readdir(dir);
	const tasks = [];

	for (const file of files) {
		if (!expectedFiles.includes(file)) {
			console.log("Deleting", file);
			tasks.push(fs.unlink(path.join(dir, file)))
		}
	}

	return Promise.all(tasks);
}

async function filterAlreadySaved(imageUrls, dir) {
	const files = await fs.readdir(dir);

	return imageUrls.filter(imgUrl => {
		const filename = urlToFilename(imgUrl);
		return !files.includes(filename);
	});
}

configFile.then(async config => {
	const imageUrls = await getImageUrls(config);
	await deleteUnexpectedFiles(imageUrls, config.location);
	const imagesToFetch = await filterAlreadySaved(imageUrls, config.location);
	console.log(`Fetching ${imagesToFetch.length} images`);

	await queue(imagesToFetch.map(imageUrl => () => saveUrl(imageUrl, config.location)));
});
