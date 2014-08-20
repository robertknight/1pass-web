SRC_ROOT=$(dir $(abspath $(lastword $(MAKEFILE_LIST))))
PKG_DIR=$(SRC_ROOT)/pkg

BROWSERIFY=browserify
FOREACH_FILE=tr ' ' '\n' | xargs -n 1
NODE=node
ROOT_DIR=$(dir $(abspath package.json))
NODE_MODULE_DIR=../../node_modules
SILENCE_CMD=1>/dev/null 2>/dev/null
SILENCE_STDOUT=1>/dev/null
TMP_DIR_CMD=mktemp -d /tmp/onepass.XXXXX
TSC=tsc -m commonjs --noImplicitAny --sourcemap
TSLINT=tslint

# CFX tool for building and testing Firefox addons
CFX=$(SRC_ROOT)/vendor/firefox-addon-sdk/bin/cfx

# JPM (Node.js-based successor to CFX) for building
# and testing Firefox addons.
#
# Requires Firefox >= 33
JPM=jpm

# crx tool for creating Chrome add-on packages
CRX=$(NODE_MODULE_DIR)/.bin/crx

# Utility script for updating the version in
# a manifest file
UPDATE_MANIFEST=$(SRC_ROOT)/utils/update-manifest-version.js
