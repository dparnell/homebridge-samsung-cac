This plugin has been replaced by a new one that does not require the `--tls-min-v1.0` trick.
See here: https://github.com/dparnell/homebridge-samsung-cac-modern

Samsung CAC Homebridge Plugin
=============================

To use this plugin you will need the IP address of your controller and an access key.
See [here](https://github.com/dparnell/samsung-cac) for details on how to get the access key.

Special Considerations
======================

As the Samsung CAC controller is quite old it uses an old insecure version of TLS to secure the connection to it.
This causes problems with modern versions of nodejs so you may need to add `--tls-min-v1.0` as a command line parameter to nodejs.
