http = require 'http'
https = require 'https'
request = require 'request'
crypto = require 'crypto'
qs = require 'querystring'
couchCred = require './couch-cred'

bb = 'https://my.rochester.edu/'
sequoia = 'https://ecard.sequoiars.com/'
sequoia2 = sequoia + 'eCardServices/eCardServices.svc/WebHttp/'
urls =
  login: bb + 'webapps/login/index'
  sequoiaToken: bb + 'webapps/bb-ecard-sso-bb_bb60/token.jsp'
  sequoiaAuth: sequoia + 'eCardServices/AuthenticationHandler.ashx'
  transactionHistory: sequoia2 + 'GetTransactionHistoryForCurrentUserSearch'

authTokenRegex = /name="AUTHENTICATIONTOKEN" value="([^"]*)/

couch =
  url: couchCred.url + '/'
  designDoc: '_design/mealplandata/'

  req: (method, path, query, data, cb) ->
    request opt=
      method: method
      uri: @url + path
      auth: couchCred.auth
      qs: query
      json: data
      jar: false
    , cb
    #console.log opt

  get: (path, query, cb) ->
    request.get @url + path, opt=
      qs: query
      json: true
      jar: false
    , cb
    #console.log path, opt

  put: (path, query, data, cb) ->
    @req 'PUT', path, query, data, cb

  getLastDate: (user, cb) ->
    @get @designDoc + '_view/last_fetch',
      key: JSON.stringify user
    , (error, response, body) ->
      date = body?.rows?[0]?.value if !error
      if date?
        cb new Date date
      else
        cb null

  saveTransactions: (user, startDate, endDate, transactions, cb) ->
    console.log 'saving transactions', transactions.length,
      transactions[0], transactions[-1..]

    # base the doc id on the dates of the transactions rather than the request
    if transactions.length > 0
      firstDate = new Date transactions[0].TransactionDateTime
      lastDate = new Date transactions[transactions.length-1].TransactionDateTime
    else
      firstDate = startDate
      lastDate = endDate
    id = hash [user, +firstDate, +lastDate].join '-'

    doc =
      _id: id
      user: user
      startDate: startDate?.getTime() || null
      endDate: endDate?.getTime() || null
      transactions: transactions
    @put id, null, doc, (error, response, body) ->
      console.log body, response.statusCode, error
      cb error || body?.error

base64Encode = (str) ->
  new Buffer(str).toString 'base64'

# get a sha1 hash
hash = (data) ->
  sum = crypto.createHash 'sha1'
  sum.update data
  sum.digest 'hex'

salt = 'piqn430984unawnu;pzsd'
# hash the net id so that users can be pseudonymous
hashNetID = (netid) ->
  sum = crypto.createHmac 'sha1', salt
  sum.update netid.toLowerCase()
  sum.digest 'hex'

fail = (res, status, msg) ->
  console.log "fail #{status}: #{msg}"
  res.writeHead status, 'Content-Type': 'application/json'
  res.end JSON.stringify error: msg

success = (res, data) ->
  console.log "success: #{data}"
  res.writeHead 200, 'Content-Type': 'application/json'
  res.end JSON.stringify data

class BBSession
  @all: {}
  @expiration: 1000*60*15,

  @get: (netid) ->
    # expire the session
    setTimeout =>
      delete @all[netid]
    , @expiration
    # get or create the session
    @all[netid] ||= new BBSession netid

  constructor: (@netid) ->
    @cookies = request.jar()
    @cookies.add request.cookie 'cookies_enabled=true'

    # make pseudonym from username
    @user = hashNetID @netid

  # login to blackboard
  auth: (pass, cb) ->
    request.post
      jar: @cookies
      uri: urls.login
      form:
        user_id: @netid
        encoded_pw: base64Encode pass
        encoded_pw_unicode: '.'
    , (error, resp, body) ->
      #console.log '????', error, resp.statusCode || resp.status, body
      cb !error and
        resp.statusCode == 302 and
        -1 == body.indexOf 'loginErrorMessage'

  # establish a session with Sequoia Retail Systems through Blackboard
  authSequoia: (cb) ->
    request urls.sequoiaToken,
      jar: @cookies,
      (error, resp, body) =>
        if error or resp.statusCode != 200
          return cb false
        m = authTokenRegex.exec body
        if !m
          return cb false
        authToken = m[1]
        if !authToken
          console.error 'unable to get auth token', body
          return cb false
        console.log 'got auth token', authToken
        request urls.sequoiaAuth,
          form: AUTHENTICATIONTOKEN: authToken
          jar: @cookies
        , (error, resp, body) ->
          console.log 'auth response', body, resp?['set-cookie']
          cb !error and body == 'No destination url posted.'

  getTransactions: (since, cb) ->
    #console.log 'req', urls.transactionHistory
    if since?
      start = since.toISOString()
    else
      start = ''
    request.post opt=
      url: urls.transactionHistory
      jar: @cookies
      json:
        fundCode: 0 # get all funds
        startDateString: start
        endDateString: ''
    , (error, resp, body) ->
      #console.log 'response', body, resp.statusCode
      if !body.d
        # need to auth again
        return cb 'expired session', []
      if error or resp.statusCode != 200
        return cb (error || true), []
      transactions = body.d._ItemList
      # remove transactions from before the requested date/time
      if since then transactions = transactions.filter (transaction) ->
        # beware of time zones here
        since < new Date transaction.TransactionDateTimeStr
      cb false, transactions

server = http.createServer (req, res) ->
  path = req.url[..req.url.indexOf '?']

  if path != '/login'
    return fail res, 400, path + ' not found'
  if req.method != 'POST'
    return fail res, 405, 'method not allowed'

  # receive post data
  data = ''
  req.on 'data', (chunk) ->
    data += chunk.toString 'ascii'
  req.on 'end', ->
    # get login credentials from post data
    body = qs.parse data

    {netid, password} = body
    if !netid or !password
      return fail res, 401, 'credentials required'

    session = BBSession.get netid
    user = session.user

    # log in to blackboard with the credentials
    console.log 'logging in', user
    session.auth password, (win) ->
      # destroy the evidence
      password = null
      if !win
        return fail res, 401, 'unable to login'
      console.log 'logged in', user

      # authenticate to sequoia
      console.log 'getting sequoia auth'
      session.authSequoia (win) ->
        if !win
          return fail res, 500, 'unable to connect'
        console.log 'got sequoia auth'

        # get date of last transactions fetched
        console.log 'getting last date'
        couch.getLastDate user, (start) ->
          console.log 'got last date', start

          # get transactions since last save
          console.log 'getting transactions'
          session.getTransactions start, (error, transactions) ->
            if error
              return fail res, 500, error, 'unable to get transactions'
            console.log 'got transactions'

            # save transactions to db (if any)
            ( (next) ->
              if transactions.length > 0
                end = new Date
                couch.saveTransactions user, start, end, transactions, (err) ->
                  if err
                    return fail res, 500, err, 'unable to save transactions'
                  next()
              else
                console.log 'no new transactions'
                next()
            ) () ->

              # return to user
              success res,
                success: true
                num_transactions: transactions.length
                user: user

server.listen 8098, '127.0.0.1'
console.log 'Server listening on http://127.0.0.1:8098/'

# vim: ts=2 sw=2 sts=2 et :
