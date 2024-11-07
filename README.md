# Watson frontend
A web-based GUI around the [Watson](https://github.com/jazzband/Watson) timetracker

## Building and running
Prerequisites:
- Git
- Node.js
- NPM
- Watson

Steps to build and use:

1. Clone this repository 

2. Modify the CONFIG variable at start of index.js (directly after the imports). Specifically CONFIG.executable_location should almost always be changed.

3. Open a shell in the directory where you cloned this repository and execute:
   ```bash
   npm install
   npm start
   ```

4. Navigate to localhost:3000, or another port if you changed CONFIG.port.
