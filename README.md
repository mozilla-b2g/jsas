jsas
====

A Javascript ActiveSync library

Getting Started
---------------

If you'd like to test out ActiveSync, the easiest way is to start using the
files in the examples/ directory. This requires you to be able to perform
cross-origin XHRs on sites that don't explicitly let you do that.

In Firefox, you can host this repo on a local server (e.g. webfsd) and then
allow your local domain to perform system XHRs by setting
dom.systemXHR.whitelist to http://localhost:8000 (or whatever you've set your
server address to).

You'll then need to add a file named credentials.js to the root directory of
jsas with variables named email and password, containing your account info.
