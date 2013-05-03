Meal Plan History Graph
=======================

This app will download a user's transaction history for their meal plan money
and other acccounts, and present it to the user as a graph.

This will work by asking the user to provide their login credentials, then 
screenscraping Blackboard and the Sequoia extension to get dining transaction
history, and then saving it to CouchDB.

Asking for login credentials requires the user to trust the app. An
alternative would be to have this be a browser extension or a bookmarklet,
but that would be more cumbersome.

Organization
------------

This web app consists of three parts:

* A node script `server.coffee` handles user logins, fetches meal plan data from
  Sequoia/Blackboard and uploads it to CouchDB.

* The couchapp `app.coffee` contains views for the meal plan data in CouchDB,
  which the front end uses to build the graphs.

* Static files in `attachments` contain the front-end of the web app. These can
  be served by the couchapp or by a separate web server. (The node script could
  also be extended to serve the static files.)

Installation
------------

* `npm install -g coffee-script`

* `npm install`

* Patch `couchapp` for CoffeeScript support:
`sed -i~ "8i try { require('coffee-script'); } catch (e) {}" node_modules/couchapp/bin.js`

* Push design document to CouchDB
`node_modules/couchapp/bin.js push app.coffee http://user:pass@localhost:5984/db`

*todo: make deploy easier*

* Populate `couch-cred.json` with the credentials for your CouchDB database, so
  that the node script can save meal plan data to it.

```bash
cp couch-cred.example.json couch-cred.json
chmod 600 couch-cred.json
vi couch-cred.json
```

* Make `/login` get handled by the npm app. It is possible to do with from
  CouchDB's configuration, but I am doing it with nginx instead:

    Copy `nginx/mealplandata.conf` into your `nginx.conf` or
    `nginx/sites-enabled/` or incorporate it into an existing server block under
    a subdirectory.

    Note: if you use this nginx configuration, you can set include_attachments
    to false in `couch-cred.json`, since nginx will be serving the static
    attachments.

