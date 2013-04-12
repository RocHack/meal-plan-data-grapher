Meal Plan Usage	Grapher
=======================

This app will download a user's transaction history for their meal plan money
and other acccounts, and present it to the user as a graph.

This will work by asking the user to provide their login credentials, then 
screenscraping Blackboard and the Sequoia extension to get dining transaction
history, and then saving it to CouchDB.

Asking for login credentials requires the user to trust the app. An
alternative would be to have this be a browser extension, but that would be more
cumbersome.
