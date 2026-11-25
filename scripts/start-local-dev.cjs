process.env.STUDY_PLANNER_LOCAL_DEV = '1';
const cli = require.resolve('next/dist/bin/next');
process.argv.splice(1, 1, cli, 'dev');
process.argv.push('--hostname', '127.0.0.1');
require(cli);
