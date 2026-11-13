/* =====================================================================
   BIYAHE RANKER · DATA FILE
   Edit or extend this file only. No other file needs to change.
   (Handy to paste into an AI assistant and ask it to add more.)

   1) SETTINGS
      hopMinutes   : minutes lost at each transfer
      boardMinutes : minutes added to every leg for waiting/boarding
      maxDetour    : hide paths longer than this x the shortest path
                     (1.5 = at most 50% longer; raise it to see more detours)

   2) MODES  (one entry per vehicle type)
      veh   : name shown in the app (must be unique)
      icon  : emoji
      speed : average speed in km/h
      fare  : { base, baseKm, perKm, min }
              fare = max(min, base + max(0, km - baseKm) * perKm)
              base   = fare for the first `baseKm` km
              baseKm = km covered by the base fare (use 0 if none)
              perKm  = pesos added per extra km
              min    = minimum fare (optional, default 0)

   3) CORRIDORS  (direct town-to-town links)
      [ "Town A", "Town B", distanceInKm ]
      Links work both ways. The app builds multi-leg trips by
      chaining links, so add a link for every pair of neighbouring
      towns. Use the same spelling every time.

   Fares and distances are rough estimates. Verify at ltfrb.gov.ph.
   ===================================================================== */

var BIYAHE_DATA = {

  settings: {
    hopMinutes: 10,
    boardMinutes: 5,
    maxDetour: 1.5
  },

  modes: [
    { veh: "Jeepney",        icon: "🚐", speed: 22, fare: { base: 14, baseKm: 4, perKm: 2 } },
    { veh: "Modern jeepney", icon: "🚌", speed: 24, fare: { base: 17, baseKm: 4, perKm: 2.4 } },
    { veh: "Bus",            icon: "🚍", speed: 30, fare: { base: 18, baseKm: 5, perKm: 2.45 } },
    { veh: "UV Express",     icon: "🚙", speed: 35, fare: { base: 15, baseKm: 0, perKm: 2.6, min: 30 } },
    { veh: "Tricycle",       icon: "🛺", speed: 18, fare: { base: 20, baseKm: 0, perKm: 8 } },
    { veh: "Grab Car",        icon: "🚕", speed: 38, fare: { base: 65, baseKm: 0, perKm: 15 } },
    { veh: "inDrive",         icon: "🚗", speed: 38, fare: { base: 50, baseKm: 0, perKm: 13 } },
    { veh: "Maxim",           icon: "🚖", speed: 38, fare: { base: 45, baseKm: 0, perKm: 12 } },
    { veh: "Taxi",            icon: "🚕", speed: 35, fare: { base: 45, baseKm: 0, perKm: 13.5 } },
    { veh: "Angkas",          icon: "🏍️", speed: 40, fare: { base: 50, baseKm: 2, perKm: 10 } },
    { veh: "Move It",         icon: "🏍️", speed: 40, fare: { base: 45, baseKm: 2, perKm: 9 } },
    { veh: "Joyride",         icon: "🏍️", speed: 40, fare: { base: 40, baseKm: 2, perKm: 9 } }
  ],

  corridors: [
    ["Los Baños", "Bay", 6],
    ["Los Baños", "Calauan", 14],
    ["Los Baños", "Calamba", 17],
    ["Los Baños", "Santa Rosa", 32],
    ["Los Baños", "Biñan", 38],
    ["Los Baños", "San Pablo", 27],
    ["Calamba", "Cabuyao", 8],
    ["Calamba", "Santa Rosa", 14],
    ["Calamba", "Biñan", 20],
    ["Calamba", "San Pablo", 30],
    ["Cabuyao", "Santa Rosa", 7],
    ["Santa Rosa", "Biñan", 8],
    ["San Pablo", "Santa Cruz", 33],
    ["Santa Cruz", "Pagsanjan", 5],
    ["Bay", "Calamba", 12]
  ]
};
