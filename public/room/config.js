(function(exports) {
  exports.ROOM_CONFIG = {
    // The size of the room background image. These must be the dimensions of
    // room.png.
    width: 3200,
    height: 1800,

    // The position at which new players enter the map. They may be offset by a
    // small amount from this location so they don't overlap each other.
    starting_position: {
      x: 100,
      y: 100,
    },

    // Optional key to show a menu at the specified location where users can
    // obtain a drink icon.
    drinks: {
      x: 1785,
      y: 280,
      range: 400,
      duration: 1000 * 60 * 10, // in ms
    },
  };
})(typeof exports === 'undefined'? document: exports);
