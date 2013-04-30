var couchURL = "design/",
    user = false;

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

var xAxisG2 = context.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height2 + ")");

context.append("g")
    .attr("class", "x brush")
    .call(brush)
  .selectAll("rect")
    .attr("y", -6)
    .attr("height", height2 + 7);

var fundCode = 0;

function update() {
  var key = [user];
  if (fundCode) key.push(fundCode);
  couch("_view/charges", {
    group_level: 4,
    startkey: key,
    endkey: key.concat({})
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
    //row.date = new Date(row.key[2], row.key[3], row.key[4] || 0);
    row.date = new Date(row.key[2], 0, row.key[3] * 7 + (row.key[4] || 0));
  });

  /*
  var layers = [],
      layersByLocation = {};
  rows.forEach(function(row) {
    var sign = row.key[0] === null ? -1 : 1;
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

  var sign = rows[0] && rows[0].key[0] === null ? -1 : 1;
  layers = locations.map(function(location) {
    return {
      name: location,
      values: rows.map(function(row) {
        return {
          date: row.date,
          name: location,
          amount: sign * row.value[location] || 0
        };
      })
    };
  });

  charges = stack(layers);

  x.domain(d3.extent(rows.map(function(d) { return d.date; })));
  y.domain([0, d3.max(layers[layers.length-1].values, function(d) { return d.y0 + d.y; })]);
  x2.domain(x.domain());
  y2.domain(y.domain());

  var layer = focus.selectAll(".layer")
      .data(charges);
  layer.enter().append("g")
      .attr("class", "layer")
      .style("fill", function(d, i) { return color(i); });
  layer.exit().remove();

  var d = new Date(),
      //w = 2;
      w = 7 * (x(d3.time.tuesday(d)) - x(d3.time.monday(d))),
      squeeze = 1 - w/width;

  var rect = layer.selectAll("rect")
      .data(function (d) { return d.values; });
  rect.enter().append("rect")
  rect.attr("width", w)
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

function brushed() {
  x.domain(brush.empty() ? x2.domain() : brush.extent());
  //focus.select("path").attr("d", area);
  focus.select(".x.axis").call(xAxis);
}

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
      //console.log('1', error, resp)
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
        showResponse({success: 'It worked!'});
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
