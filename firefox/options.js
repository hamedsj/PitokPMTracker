function save_options() {
  const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;
  var log_url = document.getElementById('log-url').value;

  storage.sync.set({
    log_url: log_url.length > 0 ? log_url : ''
  }, function () {
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function () {
      status.textContent = '';
      window.close();
    }, 750);
  });
}

function restore_options() {
  const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;

  storage.sync.get({
    log_url: ''
  }, function (items) {
    document.getElementById('log-url').value = items.log_url;
  });
}

document.addEventListener('DOMContentLoaded', function () {
  restore_options();
  document.getElementById('save').addEventListener('click', save_options);
});