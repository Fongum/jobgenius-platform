(() => {
  const registry = (window.JobGeniusAdapters = window.JobGeniusAdapters || {});

  function registerAdapter(name, adapter) {
    registry[name] = adapter;
  }

  function getAdapter(name) {
    return registry[name];
  }

  function getAllAdapters() {
    return registry;
  }

  window.JobGeniusAdapterRegistry = {
    registerAdapter,
    getAdapter,
    getAllAdapters,
  };
})();
