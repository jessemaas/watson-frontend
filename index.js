const { spawn } = require("child_process");
const csv = require("csv-parser");
const http = require("http");
const bodyParser = require("body-parser");
const express = require("express");

const CONFIG = {
  watson_executable_location: "/home/pi/.local/bin/watson",
  port: 3000,
};

let app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.redirect("/timer");
});

app.get("/timer", (req, res) => {
  timer_html((html) => res.end(html));
});

app.get("/timer-favicon.png", (req, res) => {
  res.sendFile("timer-icon-small.png", { root: __dirname });
});

app.get("/timer/:command", (req, res) => {
  const { command } = req.params;
  let watson_args = []; // command.split(" ");

  let inside_quotes = false;
  let quote_char = "";
  const possible_quote_chars = ['"', "'"];
  let next_arg = "";
  let substring_start = 0;

  for (let i = 0; i < command.length; i++) {
    if (inside_quotes && command[i] === quote_char) {
      next_arg += command.slice(substring_start, i);
      substring_start = i + 1;

      inside_quotes = false;
      quote_char = "";
    } else if (!inside_quotes && possible_quote_chars.includes(command[i])) {
      next_arg += command.slice(substring_start, i);
      substring_start = i + 1;

      inside_quotes = true;
      quote_char = command[i];
    } else if (command[i] === " " && !inside_quotes) {
      next_arg += command.slice(substring_start, i);
      substring_start = i + 1;
      if (next_arg != "") {
        watson_args.push(next_arg);
        next_arg = "";
      }
    }
  }
  next_arg += command.slice(substring_start, command.length);
  if (next_arg != "") {
    watson_args.push(next_arg);
  }

  console.log(CONFIG.watson_executable_location, watson_args);

  const watson_process = spawn(CONFIG.watson_executable_location, watson_args);

  watson_process.stdout.setEncoding("utf8");

  const go_back_link =
    '<a href="/timer" style="color:#AAF">Go back to main timer menu</a>';

  let stdout = "";
  let stderr = "";

  watson_process.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  watson_process.stderr.on("data", (data) => {
    stderr += data.toString();
    console.error(`stderr: ${data}`);
  });

  watson_process.on("close", (exit_code) => {
    res.write(`
	    <html>
	    <head>
			<title>Command result - Timer</title>
			<link rel="icon" href="/timer-favicon.png" />
	    </head>
	    <body style="background-color: #111; font-family: mono; font-size: large;">
			<pre style="color: white">${stdout}</pre>
			<pre style="color: red">${stderr}</pre>
			<div>${go_back_link}</div>
	    </body>
	    </html>`);
    console.log("watson", watson_args, "exited with code", exit_code);
    res.end();
  });
});

app.use("/public", express.static("./public"));

function timer_html(on_result, log = "") {
  let last_month = new Date();
  last_month.setMonth(last_month.getMonth() - 1);

  const watson_args = [
    "log",
    "--csv",
    "--current",
    "--from",
    `${last_month.getFullYear()}-${String(last_month.getMonth() + 1).padStart(2, "0")}-${String(last_month.getDate()).padStart(2, "0")}`,
  ]
  console.log(CONFIG.watson_executable_location, watson_args);

  const watson_process = spawn(CONFIG.watson_executable_location, watson_args);
  watson_process.stdout.setEncoding("utf8");

  const get_clock_time = (date_string) => {
    const time_parts = date_string.split(" ")[1].split(":");
    return time_parts[0] + ":" + time_parts[1];
  };

  let results = new Map();
  watson_process.stdout
    .pipe(csv())
    .on("data", (data) => {
      if (!("start" in data)) {
        return;
      }

      const key = data.start.split(" ")[0];
      const entry = results.get(key);

      if (entry) {
        entry.push(data);
      } else {
        results.set(key, [data]);
      }
    })
    .on("end", () => {
      const table = Array.from(results.entries())
        .sort(([x, _1], [y, _2]) => (x < y ? 1 : x == y ? 0 : -1))
        .map(([date, data]) => {
          const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
            new Date(date).getDay()
          ];
          let total_milliseconds = 0;
          let x = data
            .sort(({ start: start1 }, { start: start2 }) =>
              start1 < start2 ? 1 : start1 == start2 ? 0 : -1,
            )
            .map(({ id, start, stop, project, tags }) => {
              total_milliseconds += new Date(stop) - new Date(start);
              return `<tr>
<td></td>
<td>${id}</td>
<td>${get_clock_time(start)}</td>
<td>${get_clock_time(stop)}</td>
<td>${project}</td>
<td>${tags}</td>
<td>
    <button onclick="location = '/timer/start ${project} ${tags
      .split(", ")
      .filter((tag) => tag != "")
      .map((tag) => "+" + tag)
      .join(" ")}'">Restart</button>
    <button onclick="document.getElementById('command').value = 'start ${project} ${tags
      .split(", ")
      .filter((tag) => tag != "")
      .map((tag) => "+" + tag)
      .join(" ")}'">Edit (re)start command</button>
</td>
</tr>`;
            });

          const total_seconds = total_milliseconds / 1000;
          let seconds_left = total_seconds;

          const hours = Math.floor(seconds_left / 3600)
            .toString()
            .padStart(2, "0");
          seconds_left %= 3600;
          const minutes = Math.floor(seconds_left / 60)
            .toString()
            .padStart(2, "0");
          seconds_left %= 60;
          const seconds = seconds_left.toString().padStart(2, "0");

          return (
            `<tr>
		    <td colspan="3">${weekday} ${date}</td>
		    <td colspan="4">Total time: ${hours}:${minutes}:${seconds}</td>
		    </tr>` + x.join("")
          );
        });

      const html = `<!DOCTYPE html>
<html>
    <header>
        <title>Timer</title>
	<link rel="icon" href="/timer-favicon.png" />
	<style>
	body, button, input {
	    color: white;
	    background-color: #111;
	}
	body {
	    margin: 0px;
	    padding: 8px;
	    font-family: sans-serif;
	}
	#command,
	#command:focus {
	    max-width: 750px;
	    width: 100%;
	    border-top: none;
	    border-right: none;
	    border-left: none;
	    outline: none;
	}
	#command {
	    border-bottom: solid 1px grey;
	}
	#command:focus {
	    border-bottom: solid 1px white;
	}
	button, input[type=submit] {
	    border: solid grey 1px;
	}
	button:hover,
	input[type=submit]:hover,
	button:focus,
	input[type=submit]:focus {
	    border-color: white;
	    outline: none;
	}
	th, td {
	    padding-left: 0.5em;
	    padding-right: 0.5em;
	}
	#quick_actions_bar {
	    margin-top: 0.5em;
	    margin-bottom: 0.5em;
	}
	</style>
    </header>
<body>
    <form id="#command-from" onsubmit="location = ('/timer/' + document.getElementById('command').value); return false;">
	<input type="submit" value="run command:">
	<span>watson</span>
	<input type="text" id="command" autocorrect="off" autocapitalize="off"/>
    </form>
    <div id="quick_actions_bar">
	<b>Quick actions:</b>
	<a href="/timer/stop"><button>watson stop</button></a>
	<a href="/timer/report -cd"><button>watson report -cd</button></a>
    </div>
    <table>
    <tr>
	<th>Date</th>
	<th>ID</th>
	<th>Start</th>
	<th>End</th>
	<th>Project</th>
	<th>Tags</th>
	<th>Actions</th>
    </tr>
	${table.join("")}
    </table>
</body>
</html> 
`;
      on_result(html);
    });
}

const server = http.createServer(app);

server.listen(CONFIG.port, () => console.log("running on port = " + CONFIG.port));
