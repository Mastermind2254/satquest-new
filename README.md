# SAT QUEST: Operation Arctic Lifeline

Static site (GitHub Pages) + Google Apps Script for submissions. No build step.

## Run the competition
1. Open `index.html` on the team's phone, read the briefing, press ACCEPT MISSION.
2. Team enters its name; the organiser types the starting coins on that phone; press BEGIN MISSION (timer starts here).
3. Build: size, orbit, instruments, power, rocket. Launch. The result is recorded and submitted.

## Google Apps Script setup
1. Create a Google Sheet. Extensions > Apps Script. Replace the code with `apps-script/Code.gs`. Save.
2. Deploy > New deployment > type Web app. Execute as: Me. Who has access: Anyone. Deploy and authorise.
3. Copy the `/exec` URL into `SHEET_URL` in `js/config.js`, commit and push.
4. Run once and open the sheet: a `Submissions` tab is created automatically.
5. `projector.html` shows the live leaderboard from the same URL.
After editing the script, use Deploy > Manage deployments > edit > New version, or the URL will serve old code.
With `SHEET_URL` empty the game still works; submissions wait in the browser and send once it is set and the phone is online.

## Prices and scoring
`js/satquest-prices.js` holds all 34 rows of the Excel sheet (cost, points if selected, points if missed). Nothing else defines prices.

## Original rocket launch
`launch.html` and the launch animation files were not in the supplied project, so the built-in result screen is used.
When you have them: copy them into this folder, set `LAUNCH_PAGE: 'launch.html'` in `js/config.js`, and make the launch page
end by sending the team to `advanced.html#launched`. The result is then recorded as launch status "launched".
