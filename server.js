require('./app').listen(process.env.VCAP_APP_PORT || process.env.PORT || 3000)
