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

  // Returns adapter by name, falling back to GENERIC if not found.
  function resolveAdapter(atsType) {
    return registry[atsType] || registry["GENERIC"] || null;
  }

  window.JobGeniusAdapterRegistry = {
    registerAdapter,
    getAdapter,
    getAllAdapters,
    resolveAdapter,
  };
})();
