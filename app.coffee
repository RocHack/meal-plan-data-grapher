couchapp = require 'couchapp'
path = require 'path'
couchCred = require './couch-cred'

ddoc =
  _id: '_design/mealplandata'
  rewrites: [
    from: '/',
    to: 'index.html'
  ,
    from: '/design',
    to: '../../'
  ,
    from: '/design/*',
    to: '../../*'
  ,
    from: '/db',
    to: '../../'
  ,
    from: '/db/*',
    to: '../../*'
  ,
    from: '/*',
    to: '*'
  ]

ddoc.validate_doc_update = (newDoc, oldDoc, userCtx) ->
  isAdmin = -1 != userCtx.roles.indexOf '_admin'
  if isAdmin then return

  if newDoc._deleted
    throw unauthorized: 'Only admin can delete documents on this database.'

  if !newDoc.user
    throw forbidden: 'Missing user'

  if !newDoc.transactions
    throw forbidden: 'Missing transactions'

  if userCtx.name != 'mealplandata' && -1 == userCtx.roles.indexOf 'mealplandata'
    throw unauthorized: 'Only mealplandata user/role can edit documents'

ddoc.views =
  charges:
    map: (doc) ->
      user = doc.user
      doc.transactions.forEach (transaction) ->
        # only count charges
        if transaction.Type != 'Charge' then return
        fund = transaction.FundCode
        d = new Date transaction.TransactionDateTimeStr
        year = d.getFullYear()
        dayOfYear = Math.floor (d - new Date year, 0, 1) / 86400000
        week = Math.floor dayOfYear / 7
        day = dayOfYear % 7
        minutes = d.getMinutes() + d.getHours() * 60
        key = [year, week, day, minutes]
        # remove trailing number (sub-location)
        location = transaction.Location.replace /\s*[0-9]*$/, ''
        # fix weird location
        location = location.replace /^zzia11 (.*?)(?: - .*)?$/, '$1'
        # consolidate laundry and vending
        location = location.replace /^Laundry .*$/, 'Laundry'
        location = location.replace /^VR .*$/, 'Vending Machine'
        amount = -transaction.AmountInDollars
        # emit both with and without user, and fund code
        value = {}
        value[location] = amount
        # make it negative so the wildcards cancel out
        antivalue = {}
        antivalue[location] = -amount

        emit [user, fund].concat(key), value
        emit [null, fund].concat(key), antivalue
        emit [user,    0].concat(key), antivalue
        emit [null,    0].concat(key), value

    reduce: (keys, values, rereduce) ->
      totals = {}
      for value in values
        for location, amount of value
          if totals[location]
            sum = +(totals[location] + amount).toFixed 2
          else
            sum = amount
          if sum
            totals[location] = sum
          else
            delete totals[location]
      return totals

  charges_all:
    map: (doc) ->
      user = doc.user
      doc.transactions.forEach (transaction) ->
        # only count charges
        if transaction.Type != 'Charge' then return
        fund = transaction.FundCode
        d = new Date transaction.TransactionDateTimeStr
        year = d.getFullYear()
        dayOfYear = Math.floor (d - new Date year, 0, 1) / 86400000
        week = Math.floor dayOfYear / 7
        day = dayOfYear % 7
        key = [year, week, day]
        amount = -transaction.AmountInDollars
        # emit both with and without user, and fund code
        # make it negative so the wildcards cancel out
        emit [user, fund].concat(key), amount
        emit [null, fund].concat(key), -amount
        emit [user,    0].concat(key), -amount
        emit [null,    0].concat(key), amount
    reduce: '_sum'

  # count the number of users who had transcations each month
  # so the transaction amounts can be normalized
  population:
    map: (doc) ->
      user = doc.user
      year2 = month2 = 0
      for transaction in doc.transactions
        fund = transaction.FundCode
        d = new Date transaction.TransactionDateTimeStr
        year = d.getFullYear()
        month = d.getMonth()
        if month != month2 or year != year2
          year2 = year
          month2 = month
          key = [year, month]
          emit [user, fund].concat key
          emit [null, fund].concat key
          emit [user, 0].concat key
          emit [null, 0].concat key
    reduce: '_count'

  last_fetch:
    map: (doc) ->
      emit doc.user, doc.endDate
    reduce: (keys, values, rereduce) ->
      Math.max.apply Math, values

if couchCred.include_attachments
  couchapp.loadAttachments ddoc, path.join __dirname, 'attachments'

module.exports = ddoc

