process.env.LEXILOOP_DB = ':memory:'
process.env.LEXILOOP_DATA_DIR =
  process.env.LEXILOOP_DATA_DIR || `${process.cwd()}/data`
process.env.DEMO_MODE = '1'
