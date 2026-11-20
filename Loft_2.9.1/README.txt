LOFT
====
Your game launcher: Library, Store and Profile, one account for every game, one-click hosting.

START
  Double-click "Start Loft.bat" (needs Node.js). The first start downloads what it needs, so that one time needs internet.
  After that Loft works without internet. To make a real installer: npm run dist (it appears in the dist folder).
  Your data (accounts, worlds, servers) stays in %APPDATA%\Dockside, the folder the first version used, so nothing is lost.

WORKS WITHOUT INTERNET?
  Yes. Loft, your account, singleplayer, and hosting for friends on the same Wi-Fi all work offline.
  Internet is only needed for: the first install, downloading the internet helper once, and friends joining from outside your home network.

ACCOUNT
  Name 3-16 letters, numbers or _, password 6-64 characters. The account lives on this PC.
  THE PASSWORD CANNOT BE CHANGED. Your game logins are made from it, so changing it would lock you out of servers. Make a new account if you need one.
  Servers never get your Loft password. They get a separate game login made from it, so only join servers you trust a bit.
  Same name and password on another PC gives the same game logins, so your accounts on servers still work there.
  Web version in a browser? Sign in there with your name and the game password shown in Profile.

LIBRARY, STORE, PROFILE
  Library: your games. The game you played last is featured on top.
  Store: lists games and their price. Edit store.json to add entries (price is in cents, 0 means Free).
  Profile: your colour, play time per game, game logins, sign out.

HOSTING
  Game page > Host a server. First pick the world to host, then Start server. Loft runs the server in the background.
  WORLDS: every server world is saved on this PC and stays in the list. You can
    - pick one you hosted before and carry on exactly where it was,
    - make a New world (name, optional seed, PvP and loot drop settings),
    - Import from file: a world you exported from the game (singleplayer Export), or one exported from Loft. A singleplayer
      world brings your character and items with it. Imported worlds are always added as a new world, nothing is overwritten.
    - Rename, Export (a backup or a copy for a friend), open the Folder, or Delete a world.
  Friends over the internet: press "Download helper" once (a free Cloudflare tunnel, no router settings).
  Friends on your Wi-Fi can always join with the address shown.
  Stopping the server (or closing Loft) saves the world first, so the last minutes of play are not lost.
  In the game, "Open to friends" in the pause menu makes a NEW server world from the world you are in (named after it), starts
  the server and moves your base onto it. It never replaces a world you hosted before.
  Worlds live in %APPDATA%\Dockside\servers\dead-harbor\worlds. A world from the first version is kept as "My server world".

PVP (Dead Harbor 2.9)
  The server decides damage: it checks range, attack speed and real weapon damage, so nobody can hit from far away or with made-up numbers.
  You get hit markers and damage numbers (gold for headshots), a red arrow where a hit came from, and a kill feed.
  Everybody is protected for 5 seconds after joining or respawning. Attacking ends your own protection.
  Kills and deaths are counted per account and saved with the world. Hold Z (rebindable in Settings) for the player list.
  When another player kills you, you drop your items where you fell and respawn with a bat and a ration.
  Switch PvP and loot drop per world in Loft (while the server is stopped), or live in chat as the server owner:
    /pvp on   /pvp off   /loot on   /loot off      (/pvp alone shows the current setting)
  Not covered yet: someone who quits the game in the middle of a fight keeps their items (everybody sees "left in the middle of a fight").

KEYS
  Esc opens the pause menu, and Esc again closes it. Esc also closes settings, achievements, inventory, map, perks and the other screens.
  A compass at the top shows N, E, S, W, your bed (house sign) and a skull where you died, so you can get your dropped items back
  (they stay about 5 minutes). Press Y to ping the spot you are looking at: everybody on the server sees it for 90 seconds.
  If the mouse is not captured after closing the pause menu, click the game or press any key once.

PUTTING IT ON THE INTERNET (no 24/7 server needed)
  Open source launcher, closed game:
    - LICENSE (MIT) covers the launcher. games\dead-harbor\LICENSE.txt says the game is all rights reserved.
    - .gitignore keeps the "games" folder off GitHub. Use GitHub Desktop or git (they obey .gitignore). If you upload through the website,
      drag in everything EXCEPT the games folder.
    - Build the installer on your PC with:  npm run dist   (it appears in the dist folder as Loft-Setup.exe, game included).
    - On GitHub: Releases > Draft a new release > attach Loft-Setup.exe. The download button on the page points at the latest release.
    - The download page is docs\index.html. Edit the REPO line at the top of its script, then on GitHub:
      Settings > Pages > Deploy from a branch > main > /docs.
  Players download Loft and host their own worlds when they want to.
  Note: anything a player can run, they can also read. The installed game is plain files, and a friend who joins your server in the browser
  can view its code. The license and not publishing the source protect it legally; they cannot stop copying technically.
