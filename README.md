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

Installation
------------

* `npm install -g coffee-script`

* `npm install`

* Patch `couchapp` for CoffeeScript support:
`sed -i~ "8i try { require('coffee-script'); } catch (e) {}" node_modules/couchapp/bin.js`

* Push design document to CouchDB
`node_modules/couchapp/bin.js push app.coffee http://user:pass@localhost:5984/db`

*todo: make deploy easier*

* Make `/login` get handled by the npm app. It is possible to do with from
  CouchDB's configuration, but I am doing it with nginx instead:
  
    Copy `nginx/mealplandata.conf` into your `nginx.conf` or `nginx/sites-enabled/`
    or incorporate it into an existing server block under a subdirectory.


