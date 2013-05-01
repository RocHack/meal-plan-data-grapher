var couchURL = "design/",
    user = false;

function debounce(fn, ms) {
  var timeout, context, args;
  function exec() {
    fn.apply(context, args);
  }
  return function () {
    context = this;
    args = arguments;
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(exec, ms || 50);
  };
}

function parseQueryString(qs) {
  var query = {};
  qs.split("&").forEach(function (pair) {
    if (pair) {
      var keyVal = pair.split("=");
      query[decodeURIComponent(keyVal[0])] = decodeURIComponent(keyVal[1]);
    }
  });
  return query;
}

function makeQueryString(query, json) {
  var pairs = [];
  for (var name in query)
    pairs.push(encodeURIComponent(name) + "=" +
      encodeURIComponent(json ? JSON.stringify(query[name]) : query[name]));
  return pairs.join("&");
}

// make a url and query string with json-encoded values
function couchPath(url, query) {
  return couchURL + url + (query ? "?" + makeQueryString(query, true) : "");
}

// make a request to the database
function couch(path, query, cb) {
  d3.json(couchPath(path, query), cb);
}

d3.select("#get_data_link").on("click", function () {
  d3.event.preventDefault();
  d3.select("#netid").node().focus();
});

var margin = {top: 10, right: 10, bottom: 100, left: 40},
    margin2 = {top: 330, right: 10, bottom: 20, left: 40},
    width = 960 - margin.left - margin.right,
    height = 400 - margin.top - margin.bottom,
    height2 = 400 - margin2.top - margin2.bottom;

var color = d3.scale.category20c();

var x = d3.time.scale().rangeRound([0, width]),
    x2 = d3.time.scale().rangeRound([0, width]),
    y = d3.scale.linear().range([height, 0]),
    y2 = d3.scale.linear().range([height2, 0]);

var xAxis = d3.svg.axis().scale(x).orient("bottom"),
    xAxis2 = d3.svg.axis().scale(x2).orient("bottom"),
    yAxis = d3.svg.axis().scale(y).orient("left");

var brush = d3.svg.brush()
    .x(x2)
    .on("brush", brushed);

var binWidth = 0,
    binDuration = 0;

/*
var area = d3.svg.area()
    .interpolate("monotone")
    .x(function(d) { return x(d.date); })
    .y0(height)
    .y1(function(d) { return y(d.y); });

var area2 = d3.svg.area()
    .interpolate("monotone")
    .x(function(d) { return x2(d.date); })
    .y0(height2)
    .y1(function(d) { return y2(d.price); });
*/

var w = width + margin.left + margin.right,
    h = height + margin.top + margin.bottom;
var svg = d3.select("#graph").append("svg")
    .attr("preserveAspectRatio", "xMidYMid")
    .attr("viewBox", [0, 0, w, h])
    .attr("width", w)
    .attr("height", h);

var aspect = w/h,
    container = svg.node().parentNode;

function resized() {
  var targetWidth = container.offsetWidth;
  svg.attr("width", targetWidth)
      .attr("height", Math.round(targetWidth/aspect));
}
resized();
d3.select(window).on("resize", resized);

svg.append("defs").append("clipPath")
    .attr("id", "clip")
  .append("rect")
    .attr("width", width)
    .attr("height", height);

var focus = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

var context = svg.append("g")
    .attr("transform", "translate(" + margin2.left + "," + margin2.top + ")");

var stack = d3.layout.stack()
    .values(function(d) { return d.values; })
    .x(function(d) { return d.date; })
    .y(function(d) { return d.amount; });

var xAxisG = focus.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height + ")");

var yAxisG = focus.append("g")
    .attr("class", "y axis");

var contextBars = context.append("g")
    .attr("class", "bars");

var xAxisG2 = context.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height2 + ")");

context.append("g")
    .attr("class", "x brush")
    .call(brush)
  .selectAll("rect")
    .attr("y", -6)
    .attr("height", height2 + 7);

var fundCode = 1;

// update the context graph
function update() {
  var key = [user, fundCode];
  couch("_view/charges_all", {
    group_level: 4,
    startkey: key,
    endkey: key.concat({})
  }, gotChargesAll);
}

function gotChargesAll(error, resp) {
  if (error) {
    showResponse({error: error});
    return;
  }

  var data = resp.rows;

  data.forEach(function(row) {
    var year = row.key[2];
    var day = row.key[4] || 0;
    var week = row.key[3];
    row.date = new Date(year, 0, 7 * week + day);
    row.amount = Math.abs(row.value);
  });

  if (!didBrush) {
    x.domain(d3.extent(data.map(function(d) { return d.date; })));
    x2.domain(x.domain());
  }
  y2.domain([0, d3.max(data, function(d) { return d.amount; })]);

  var d = new Date(),
      duration = 86400000 * 7;
      w = (x2(d) - x2(d - duration)),
      squeeze = 1 - w/width;
  var rect = contextBars.selectAll("rect")
      .data(data);
  rect.enter().append("rect");
  rect.attr("width", w * squeeze)
      .attr("height", function(d) { return height2 - y2(d.amount); })
      .attr("x", function(d) { return x2(d.date) * squeeze; })
      .attr("y", function(d) { return y2(d.amount); });
  rect.exit().remove();

  updateCharges();
}

// update main chart
function updateCharges() {
  var startDate = x.domain()[0],
      endDate = x.domain()[1],
      startYear = startDate.getFullYear(),
      endYear = endDate.getFullYear(),
      startWeek = Math.round((startDate - new Date(startYear, 0, 1)) / 86400000 / 7),
      endWeek = Math.round((endDate - new Date(endYear, 0, 1)) / 86400000 / 7);

  binWidth = 30;// * width/svg.attr("width");
  binDuration = x.invert(binWidth) - x.domain()[0];

  var binMinutes = binDuration / 60000,
      binDays = binMinutes / 1440,
      binWeeks = binDays / 7,
      granularity = 0;
  if (binWeeks > 1) {
    binWeeks = Math.floor(binWeeks);
    binDays = binWeeks * 7;
    binMinutes = binDays * 1440;
	granularity = 1;
  } else if (binDays > 1) {
    binDays = Math.floor(binDays);
    binMinutes = binDays * 1440;
    granularity = 2;
  } else {
    binMinutes = Math.floor(binMinutes);
    granularity = 3;
  }
  binDuration = binMinutes * 60000;
  binWidth = x(startDate) - x(startDate - binDuration);
  //console.log(binWidth, binDuration, binMinutes, binDays, binWeeks, granularity);

  couch("_view/charges", {
    group_level: 3 + granularity,
    startkey: [user, fundCode, startYear, startWeek],
    endkey: [user, fundCode, endYear, endWeek]
  }, gotCharges);
}

function gotCharges(error, resp) {
  if (error) {
    showResponse({error: error});
    return;
  }

  var rows = resp.rows;
  if (!rows.length) {
    focus.selectAll(".layer rect").remove();
    return;
  }

  rows.forEach(function(row) {
    var day = row.key[4] || 0;
    var week = row.key[3];
    var minutes = row.key[5] || 0;
    row.date = new Date(row.key[2], 0, 7 * week + day, 0, minutes);
  });

  /*
  var layers = [],
      layersByLocation = {};
  rows.forEach(function(row) {
    var sign = row.key[0] === 0 ? -1 : 1;
    for (var location in row.value) {
      var amount = sign * row.value[location],
          layer = layersByLocation[location];
      if (!layer) {
        layer = layersByLocation[location] = {
          name: location,
          values: []
        };
        layers.push(layer);
      }
      layer.values.push({
        date: row.date,
        y: amount
      });
    }
  });
  */

  var locations = [],
      locationsMap = {};
  rows.forEach(function(row) {
    for (var location in row.value) {
      locations[location] = true;
    }
  });
  for (var location in locations) {
    locations.push(location);
  }

  layers = locations.map(function(location) {
    return {
      name: location,
      color: color(location),
      values: rows.map(function(row) {
        return {
          date: row.date,
          name: location, // no
          amount: Math.abs(row.value[location]) || 0
        };
      })
    };
  });

  //console.log(layers);

  // bin it
  layers = layers.map(function (layer) {
    var values = [],
        prevValue;
    layer.values.forEach(function (value) {
      if (prevValue && (value.date - prevValue.date) < binDuration) {
        prevValue.amount += value.amount;
      } else {
        prevValue = {
          date: new Date(Math.floor(value.date/binDuration) * binDuration),
          //date: value.date,
          name: value.name, // no
          amount: value.amount
        };
        //if (isNaN(a)) console.log(value.date, binDuration);
        values.push(prevValue);
      }
    });
    return {
      name: layer.name,
      color: layer.color,
      values: values
    };
  });

  //console.log('binned', layers);

  charges = stack(layers);

  y.domain([0, d3.max(layers[layers.length-1].values, function(d) { return d.y0 + d.y; })]);

  var layer = focus.selectAll(".layer")
      .data(charges);
  layer.enter().append("g")
      .attr("class", "layer")
      .style("fill", function(d) { return d.color; });
  layer.exit().remove();

  var squeeze = 1 - w/width;

  var rect = layer.selectAll("rect")
      .data(function (d) { return d.values; });
  rect.enter().append("rect");
  rect.attr("width", binWidth * squeeze)
      .attr("height", function(d) { return y(d.y0) - y(d.y0 + d.y); })
      .attr("x", function(d) { return x(d.date) * squeeze; })
      .attr("y", function(d) { return y(d.y0 + d.y); })
      .attr("data-name", function(d) { return d.name; });
  rect.exit().remove();

  xAxis(xAxisG);
  yAxis(yAxisG);
  xAxis2(xAxisG2);

  // Add a rect for each date.
  /*
  var rect = layer.selectAll("rect")
      .data(Object)
    .enter().append("svg:rect")
      .attr("x", function(d) { return x(d.x); })
      .attr("y", function(d) { return -y(d.y0) - y(d.y); })
      .attr("height", function(d) { return y(d.y); })
      .attr("width", x.rangeBand());
  */

  /*
  layer.append("path")
      .attr("class", "area")
      .attr("clip-path", "url(#clip)")
      .attr("d", area)
      .attr("d", function(d) { return area(d.values); })
      .style("fill", function(d) { return color(d.name); });
  */
}

var updateChargesDebounced = debounce(updateCharges);
var didBrush = false;
function brushed() {
  didBrush = true;
  x.domain(brush.empty() ? x2.domain() : brush.extent());
  focus.select(".x.axis").call(xAxis);

  updateChargesDebounced();
}

// Login stuff

var note = d3.select("#response_note");
function showResponse(response) {
  if (!response) note.text('');
  else note.text(response.success || response.error || '')
    .classed("success", response.success)
    .classed("error", response.error);
}

function xhrJSON(request) {
  return JSON.parse(request.responseText);
}

var loginForm = d3.select("#login_form");

loginForm.on("submit", function() {
  d3.event.preventDefault();
  loginForm.classed("loading", true);
  showResponse();
  d3.json(this.action)
    .post('netid=' + encodeURIComponent(d3.select("#netid").node().value) +
      '&password=' + encodeURIComponent(d3.select("#password").node().value),
    function (error, resp) {
      loginForm.classed("loading", false);
      if (error) {
        try {
          resp = xhrJSON(error);
          error = resp.error || resp;
        } catch(e) {
          error = 'Request failed';
        }
        showResponse({error: error});
      } else {
        var numTransactionsFetched = resp.num_transactions;
        var user = resp.user;
        showResponse({success: 'It worked! Now wait for your data to appear.'});
        setHashItem("user", user);
      }
    });
});

var hash = {};
function updateHash() {
  hash = parseQueryString(location.hash.substr(1));
  if (user !== hash.user) {
    user = hash.user || null;
    update();
  }
}

function setHashItem(key, value) {
  hash[key] = value;
  location.hash = "#" + makeQueryString(hash);
}

d3.select(window).on("hashchange", updateHash);

d3.select("#fund_select").on("change", function() {
  fundCode = +this.value;
  update();
});

updateHash();

