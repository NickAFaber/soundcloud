const fs = require("fs");
const Path = require("path");

const OAUTH = "";
const USER_ID = "";
const OUTPUT = "";
const API = "https://api-v2.soundcloud.com";
const RATE_LIMIT = 2000;

let downloads = [];

/**
 * https://stackoverflow.com/a/39914235
 * not implemented but might need for rate limiting in the future
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * https://github.com/ytdl-org/youtube-dl/blob/5208ae92fc3e2916cdccae45c6b9a516be3d5796/youtube_dl/utils.py#L2079
 * @param {String} str text to sanitize
 * @returns {String} Windows filename sanitized version of str
 */
function sanitize(str) {
  ret = str;
  ret = ret.replace(/[0-9]+(?::[0-9]+)+/, "_");
  ret = ret.replace(/\?/g, "");
  ret = ret.replace(/"/g, "'");
  ret = ret.replace(/:{1}/, " -");
  ret = ret.replace(/[/\\?*:|"<>]/g, "_");
  ret = ret.replace(/__/g, "_");
  ret = ret.trim("_");
  if (ret[0] === "-") ret = `_${ret.substring(1)}`;
  return ret;
}

/**
 * @param {String} url URL to fetch
 * @returns {Promise} JSON response object
 */
async function get(url) {
  process.stdout.write(`GET ${url}`);
  const resp = await fetch(url, {
    credentials: "include",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0",
      Authorization: `OAuth ${OAUTH}`,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-CA,en-US;q=0.7,en;q=0.3",
    },
  });
  await sleep(RATE_LIMIT);
  process.stdout.write(
    ` ${resp.status === 200 ? "\x1b[32m" : "\x1b[31m"}${resp.status}\x1b[0m\n`
  );
  if (resp.status !== 200) {
    console.log(`\x1b[31mError ${resp.status}: ${resp.statusText}\x1b[0m\n\n`);
    console.log(resp);
    await waitForKeypress();
  }
  const json = await resp.json();
  return json;
}

/**
 * @param {Number} max the maximum number of playlists to fetch
 * @returns {Promise} array of track titles you have liked from albums/playlists
 */
async function getLists(max) {
  let likes = [];
  let urls = [];

  const playlistsJSON = await get(`${API}/me/library/all?limit=${max}`);
  // fs.appendFileSync("./test.json", JSON.stringify(playlistsJSON, null, 2));

  for (const playlistObj of playlistsJSON.collection) {
    // skip stations
    if (playlistObj.system_playlist) {
      continue;
    }

    const playlistID = playlistObj.playlist.id;
    const playlistJSON = await get(`${API}/playlists/${playlistID}`);

    for (let track of playlistJSON.tracks) {
      // soundcloud only returns titles of the first 5 tracks in a playlist
      // so we have to fetch the specific track ID to get the title
      if (!track.title) {
        const trackID = track.id;
        track = await get(`${API}/tracks/${trackID}`);
      }
      const url = track.permalink_url;
      urls.push(url);
      const title = sanitize(track.title);
      if (title) {
        likes.push(title);
      }
    }
  }

  fs.appendFileSync("./likes.txt", likes.join("\n"));
  for (let i = 0; i < urls.length; i++) {
    fs.appendFileSync("./urls.txt", `${likes[i]} ; ${urls[i]}\n`);
  }
  return likes;
}

/**
 * @param {Number} max the maximum number of likes to fetch
 * @returns {Promise} array of track titles you have liked
 */
async function getLikes(max) {
  let likes = [];
  let urls = [];

  const likesJSON = await get(
    `${API}/users/${USER_ID}/track_likes?limit=${max}`
  );
  for (const like of likesJSON.collection) {
    const track = like.track;
    const title = sanitize(track.title);
    const url = track.permalink_url;
    likes.push(title);
    urls.push(url);
  }
  fs.writeFileSync("./likes.txt", likes.join("\n"));
  fs.writeFileSync("./urls.txt", "");
  for (let i = 0; i < likes.length; i++) {
    fs.appendFileSync("./urls.txt", `${likes[i]} ; ${urls[i]}\n`);
  }
  return likes;
}

/**
 *
 * @param {String} dir root directory where likes are saved
 */
function getDownloads(dir) {
  fs.readdirSync(dir).forEach((file) => {
    const absolute = Path.join(dir, file);
    if (fs.statSync(absolute).isDirectory()) {
      return getDownloads(absolute);
    }
    const dirs = absolute.split("\\");
    const format = dirs[dirs.length - 1].slice(-3);
    const allowedFormats = ["aac", "wav", "mp3"];
    if (allowedFormats.indexOf(format) !== -1) {
      const title = dirs[dirs.length - 1].slice(0, -4);
      if (title !== "") {
        downloads.push(title);
      }
    }
  });
}

/**
 * @returns {Promise} total number of liked tracks and playlist/album tracks
 */
async function getTotal() {
  const resp = await get(`${API}/users/${USER_ID}`);
  const likes_count = resp.likes_count;
  const playlist_likes_count = resp.playlist_likes_count;
  return { likes: likes_count, lists: playlist_likes_count };
}

/**
 * https://stackoverflow.com/a/63545283
 * @returns {Promise}
 */
function waitForKeypress() {
  return new Promise((resolve) => {
    console.log("PRESS ANY KEY TO CONTINUE");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", () => {
      process.stdin.destroy();
      resolve();
    });
  });
}

const main = async function () {
  const date = new Date();
  const timestamp = date.toString();
  fs.writeFileSync("last_run.txt", `${timestamp}\n\n`);

  const total = await getTotal();
  const reportedLikes = total.likes;
  const reportedLists = total.lists;

  const receivedLikes = await getLikes(reportedLikes);
  const receivedLists = await getLists(reportedLists);

  const totalReceived = receivedLikes.length + receivedLists.length;
  const difference = Math.abs(reportedLikes - receivedLikes.length);

  console.log(``);
  console.log(`# reported liked tracks: ${reportedLikes}`);
  console.log(`# received liked tracks : ${receivedLikes.length}`);
  if (difference > 0) {
    console.log(`\x1b[31m`); // fg red
    console.log(
      `${difference} fewer liked tracks received than reported (likely geoblocked)\x1b[0m`
    );
  }
  console.log(``);
  console.log(`# reported liked albums/lists: ${reportedLists}`);
  console.log(`# received tracks in albums/lists : ${receivedLists.length}`);
  console.log(``);
  console.log(`Total received tracks: ${totalReceived}`);
  console.log(``);

  getDownloads(OUTPUT);
  fs.writeFileSync("./downloads.txt", downloads.join("\n"));
  console.log(
    `${downloads.length} liked tracks found in ${OUTPUT} (${
      downloads.length - totalReceived
    } more than SoundCloud)`
  );
  console.log(``);

  const deletedList = fs.readFileSync("./missing.txt", "utf-8");
  const deleted = deletedList.split("\n");

  // in dl, not receivedLikes
  const missing = downloads.filter(
    (song) => !receivedLikes.includes(song) && !receivedLists.includes(song)
  );

  // in dl, not in receievedLikes or missing.txt
  const newMissing = downloads.filter(
    (song) =>
      !deleted.includes(song) &&
      !receivedLikes.includes(song) &&
      !receivedLists.includes(song)
  );

  // in dl, in likes or missing.txt
  const reuploaded = downloads.filter(
    (song) =>
      deleted.includes(song) &&
      (receivedLikes.includes(song) || receivedLists.includes(song))
  );

  fs.writeFileSync("missing.txt", `${timestamp}\n\n`);
  for (let i = 0; i < missing.length; i++) {
    fs.appendFileSync("missing.txt", `${missing[i]}\n`);
  }

  if (newMissing.length) {
    console.log("New tracks are missing or have a different title:");
    fs.appendFileSync("new_missing.txt", `\n${timestamp}\n\n`);
    for (let i = 0; i < newMissing.length; i++) {
      fs.appendFileSync("new_missing.txt", `${newMissing[i]}\n`);
      console.log(newMissing[i]);
    }
    console.log(``);
  }

  if (reuploaded.length) {
    console.log("\nSome tracks have been reuploaded:");
    console.log(reuploaded.join("\n"));
    fs.writeFileSync("reuploaded.txt", `${timestamp}\n\n`);
    for (let i = 0; i < reuploaded.length; i++) {
      fs.appendFileSync("reuploaded.txt", `${reuploaded[i]}\n`);
    }
    console.log(``);
  }

  if (newMissing.length == 0 && reuploaded.length == 0) {
    console.log(
      `\x1b[32mNothing has changed since ${fs.readFileSync(
        "last_run.txt"
      )}\x1b[0m`
    );
  }

  await waitForKeypress();
  process.exit();
};

main();
