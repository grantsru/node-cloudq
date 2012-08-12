// cloudq run queue
require('date-utils');

var flatiron = require('flatiron'),
  request = require('request'),
  es = require('event-stream'),
  parseRows = require('JSONStream').parse(['rows', true, 'value']),
  app = flatiron.app;

var cloudq = process.env.COUCH || 'http://localhost:5984/cloudq';

// get cloudq job
app.router.get('/:queue', function(queue) {
  var self = this;

  // get job from queue
  request(cloudq + '/_design/queued/_view/name?limit=1', { json: { startkey: [queue, 1] } }, function(e,r,b){
    // if found
    if(b && b.rows && b.rows.length === 1) {
      var job = b.rows[0].value.job;
      job.id = b.rows[0].id;
      reserveJob(self.res, job);
    } else {
      // return queue empty
      empty(self.res);
    }
  });
});

// post cloudq job
app.router.post('/:queue', function(queue){
  var self = this;
  var job = function(data, cb) {
    var doc = JSON.parse(data);
    doc = jobify(doc, queue);
    cb(null, JSON.stringify(doc));
  }

  // validate job - should have job node...
  if(this.req.body.job) {
    es.pipeline(
      this.req,
      es.map(job),
      request.post(cloudq, { json: true }),
      this.res
    );
  } else {
    renderErr(this.res, {error: 'Job Object is required!'});
  }
  
});

// complete cloudq job
app.router.delete('/:queue/:id', function(queue, id){
  var self = this;
  es.pipeline(
    this.req,
    request.put(cloudq + '/_design/complete/_update/id/' + id, {json: true }),
    es.mapSync(function(data){ success(self.res); })
  );
});

function success(res) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({status: 'success'}));
}

function empty(res) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({status: 'empty'}));
}

function renderJob(res, job) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(job));  
}

function renderErr(res, err) {
  res.writeHead(400, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(err));  
}

function reserveJob(res, job) {
  // set it to reserved state
  request.put(cloudq + '/_design/dequeue/_update/id/' + job.id, {json: true}, function(err){
    // return job if successful
    if(!err){
      renderJob(res, job);
    } else {
      renderErr(res, {error: 'Unable to dequeue - ' + id});
    }
  });
}

function jobify(job, queue) {
  job.queue = queue;
  job.type = 'job';
  job.queue_state = 'queued';
  if(!job.priority) { job.priority = 1 };
  job.expires_in = (new Date()).addDays(1);
  return job;
}