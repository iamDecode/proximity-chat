'use strict';

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
  };
})(typeof exports === 'undefined'? document: exports);
