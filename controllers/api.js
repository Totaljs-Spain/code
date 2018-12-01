const Path = require('path');
const Fs = require('fs');

exports.install = function() {
	GROUP(['authorize'], function() {

		ROUTE('GET     /api/{schema}/                          *{schema}     --> @query');
		ROUTE('GET     /api/{schema}/{id}/                     *{schema}     --> @read');
		ROUTE('POST    /api/{schema}/                          *{schema}     --> @save');
		ROUTE('DELETE  /api/{schema}/{id}/                     *{schema}     --> @remove');
		ROUTE('POST    /api/{schema}/{id}/                     *{schema}     --> @save');

		// Files
		ROUTE('POST    /api/files/{id}/rename/                 *FilesRename  --> @exec');
		ROUTE('POST    /api/files/{id}/remove/                 *FilesRemove  --> @exec');
		ROUTE('POST    /api/files/{id}/create/                 *FilesCreate  --> @exec');

		// Projects
		ROUTE('POST    /api/projects/{id}/tasks/               *Tasks        --> @insert');
		ROUTE('GET     /api/projects/{id}/tasks/               *Tasks        --> @query');
		ROUTE('GET     /api/projects/{id}/tasks/{taskid}/      *Tasks        --> @solved');
		ROUTE('GET     /api/projects/{id}/tasks/uncomplete/    *Tasks        --> @uncomplete');
		ROUTE('POST    /api/projects/{id}/comments/            *Comments     --> @insert');
		ROUTE('GET     /api/projects/{id}/comments/            *Comments     --> @query');
		ROUTE('POST    /api/projects/{id}/upload/              *FilesUpload  --> @exec', ['upload'], 1024 * 50);
		ROUTE('GET     /api/projects/{id}/files/               *Projects     --> @files');
		ROUTE('GET     /api/projects/{id}/backups/             *Projects     --> @backups');
		ROUTE('DELETE  /api/projects/{id}/backups/             *Projects     --> @backupsclear', [10000]);
		ROUTE('GET     /api/projects/{id}/restore/             *Projects',   files_restore);
		ROUTE('GET     /api/projects/{id}/edit/                *Projects',   files_open);

		// Other
		ROUTE('GET     /api/download/{id}/',                                 files_download);
		ROUTE('POST    /api/files/minify/                      *Minify',     files_minify);
		ROUTE('GET     /logout/', redirect_logout);

		ROUTE('GET    /api/users/online/',                                   users_online);
		ROUTE('GET    /api/users/refresh/',                                  users_refresh);

	});

	GROUP(['unauthorize'], function() {
		ROUTE('POST    /api/login/                    *Login        --> @save');
	});

};

function redirect_logout() {
	var self = this;
	self.cookie(F.config.cookie, '', '-1 day');
	self.redirect('/');
}

function files_open(id) {
	var self = this;
	self.id = id;
	self.$workflow('edit', self.query, function(err, data) {
		if (err)
			self.invalid(err);
		else
			self.plain(data);
	});
}

function files_restore(id) {
	var self = this;
	self.id = id;
	self.$workflow('restore', self.query, function(err, data) {
		if (err)
			self.invalid(err);
		else
			self.plain(data);
	});
}

function files_download(id) {

	var self = this;
	var item = MAIN.projects.findItem('id', id);

	if (!item) {
		self.invalid('error-project');
		return;
	}

	var path = self.query.path || '';
	var filename = Path.join(item.path, path);

	if (MAIN.authorize(item, self.user, path)) {
		Fs.lstat(filename, function(err, stats) {

			if (err || stats.isDirectory()) {
				self.invalid('error-file');
				return;
			}

			var ext = U.getExtension(filename).toLowerCase();
			var meta = {};

			MAIN.log(self.user, 'files_read', item, filename);

			// Special
			if (ext === 'file' || ext === 'nosql-binary') {
				meta.start = 0;
				meta.end = 2000;
				Fs.createReadStream(filename, meta).on('data', function(buffer) {
					var data = buffer.toString('utf8');
					data = data.substring(0, data.lastIndexOf('}') + 1).parseJSON();
					meta.start = 2000;
					delete meta.end;
					self.stream(data.type, Fs.createReadStream(filename, meta));
				}).on('end', function() {
					// Fallback
					!meta.start && self.throw404();
				});
			} else
				self.stream(U.getContentType(ext), Fs.createReadStream(filename, meta));

		});
	} else
		self.invalid('error-permissions');
}

function users_online() {

	var self = this;
	var arr = [];

	for (var i = 0; i < MAIN.users.length; i++) {
		var user = MAIN.users[i];
		if (user.online) {
			var item = {};
			var project = MAIN.projects.findItem('id', user.projectid);
			if (project)
				item.project = project.name + (user.fileid || '');
			item.name = user.name;
			arr.push(item);
		}
	}

	self.json(arr);
}

function users_refresh() {
	var self = this;
	if (self.user.sa) {
		MAIN.send({ TYPE: 'refresh' });
		self.success();
	} else
		self.invalid('error-permissions');
}

function files_minify() {
	var self = this;
	self.body.$workflow('exec', (err, response) => self.plain(response || ''));
}