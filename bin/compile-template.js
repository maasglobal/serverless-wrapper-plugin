#!/usr/bin/env node

'use strict';

const dots = require("dot");
dots.process({
    path: "./lib",
    templateSettings: {
        strip: false,
    }
});
