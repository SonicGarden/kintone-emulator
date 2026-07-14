(function () {
  'use strict';

  var _handlers = {};

  function toArray(v) {
    return Array.isArray(v) ? v : [v];
  }

  window.kintone = {
    events: {
      on: function (types, handler) {
        toArray(types).forEach(function (type) {
          if (!_handlers[type]) _handlers[type] = [];
          _handlers[type].push(handler);
        });
      },
      off: function (types, handler) {
        toArray(types).forEach(function (type) {
          if (!handler) {
            _handlers[type] = [];
          } else {
            _handlers[type] = (_handlers[type] || []).filter(function (h) { return h !== handler; });
          }
        });
      },
      fire: function (type, event) {
        var list = (_handlers[type] || []).slice();
        return list.reduce(function (p, handler) {
          return p.then(function (evt) {
            return Promise.resolve(handler(evt)).then(function (ret) {
              return (ret != null) ? ret : evt;
            });
          });
        }, Promise.resolve(event));
      }
    },
    app: {
      getId: function () {
        return window.__kintoneAppId != null ? window.__kintoneAppId : null;
      },
      record: {
        get: function () {
          return window.__kintoneRecord != null ? window.__kintoneRecord : null;
        },
        set: function (record) {
          window.__kintoneRecord = record;
        }
      }
    }
  };
})();
