couchapp = require 'couchapp'
path = require 'path'

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
      doc.transactions.forEach (transaction) ->
      #for transaction in doc.transactions
        # only count charges
        if transaction.Type != 'Charge' then return
        d = new Date transaction.TransactionDateTimeStr
        year = d.getFullYear()
        week = Math.round (d - new Date year, 0, 1) / 86400000 / 7
        key = [transaction.FundCode
          year, week, d.getDay(), d.getHours()]
        # remove trailing number (sub-location)
        location = transaction.Location.replace /\s*[0-9]*$/, ''
        amount = -transaction.AmountInDollars
        value = {}
        value[location] = amount
        # emit both with and without user
        emit [doc.user].concat(key), value
        # make it negative so they cancel out. ha! ha!
        value2 = {}
        value2[location] = -amount
        emit [null].concat(key), value2

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

  ###
  population:
    map: (doc) ->
      y = m = d = 0
      for transaction in doc.transactions
        d = new Date transaction.TransactionDateTimeStr
        year = d.getFullYear()
        month = d.getMonth()
        day = d.getDate()
        if d != day or m != month or y != year
          d = day
          m = month
          y = year
          key = [transaction.FundCode, year, month, day, 1]
          emit [doc.user].concat(key)
          emit [null].concat(key)
    reduce: '_count'
  ###

  last_fetch:
    map: (doc) ->
      emit doc.user, doc.endDate
    reduce: (keys, values, rereduce) ->
      Math.max.apply Math, values

couchapp.loadAttachments ddoc, path.join __dirname, 'attachments'

module.exports = ddoc

