/******************************************************************************
 *
 * Copyright (c) 2017, the Perspective Authors.
 *
 * This file is part of the Perspective library, distributed under the terms of
 * the Apache License 2.0.  The full license can be found in the LICENSE file.
 *
 */

const {execute, execute_throw, docker, clean, resolve, getarg, bash, python_image} = require("./script_utils.js");
const fs = require("fs-extra");
const rimraf = require("rimraf");

const IS_PY2 = getarg("--python2");

let PYTHON = IS_PY2 ? "python2" : getarg("--python38") ? "python3.8" : getarg("--python36") ? "python3.6" : "python3.7";
let IMAGE = "manylinux2010";
const IS_DOCKER = process.env.PSP_DOCKER;

if (IS_DOCKER) {
    // defaults to 2010
    let MANYLINUX_VERSION = "manylinux2010";
    if (!IS_PY2) {
        // switch to 2014 only on python3
        (MANYLINUX_VERSION = getarg("--manylinux2010") ? "manylinux2010" : getarg("--manylinux2014") ? "manylinux2014" : ""), PYTHON;
    }
    IMAGE = python_image(MANYLINUX_VERSION, PYTHON);
}

const IS_CI = getarg("--ci");
const IS_INSTALL = getarg("--install");

// Check that the `PYTHON` command is valid, else default to `python`.
try {
    execute_throw`${PYTHON} --version`;
} catch (e) {
    console.warn(`\`${PYTHON}\` not found - using \`python\` instead.`);
    PYTHON = "python";
}

try {
    const dist = resolve`${__dirname}/../python/perspective/dist`;
    const third = resolve`${__dirname}/../cpp/perspective/third`;
    const cpp = resolve`${__dirname}/../cpp/perspective`;
    const lic = resolve`${__dirname}/../LICENSE`;
    const dlic = resolve`${dist}/LICENSE`;
    const obj = resolve`${dist}/obj`;

    // clone third party deps
    if (!fs.existsSync(third)) {
        console.log("Cloning third party dependencies");
        fs.mkdirpSync(third);
        execute`git clone https://github.com/HowardHinnant/date.git ${third}/date`;
        execute`git clone https://github.com/Tessil/hopscotch-map.git ${third}/hopscotch`;
        execute`git clone https://github.com/Tessil/ordered-map.git ${third}/ordered-map`;
        execute`git clone https://github.com/pybind/pybind11.git ${third}/pybind11`;

        rimraf.sync(`${third}/date/.git`);
        rimraf.sync(`${third}/hopscotch/.git`);
        rimraf.sync(`${third}/ordered-map/.git`);
        rimraf.sync(`${third}/pybind11/.git`);
        console.log("Cloning third party dependencies...done!");
    }

    fs.mkdirpSync(dist);
    fs.copySync(cpp, dist, {preserveTimestamps: true});
    fs.copySync(lic, dlic, {preserveTimestamps: true});
    clean(obj);

    let cmd;
    if (IS_CI) {
        if (IS_PY2)
            // shutil_which is required in setup.py
            cmd = bash`${PYTHON} -m pip install backports.shutil_which &&`;
        else cmd = bash``;

        cmd =
            cmd +
            `${PYTHON} -m pip install -e .[dev] && \
            ${PYTHON} -m flake8 perspective && echo OK && \
            ${PYTHON} -m pytest -vvv --noconftest perspective/tests/client && \
            ${PYTHON} -m pytest -vvv perspective \
            --ignore=perspective/tests/client \
            --junitxml=python_junit.xml --cov-report=xml --cov-branch \
            --cov=perspective`;
        if (IMAGE == "python") {
            cmd =
                cmd +
                `&& \
                ${PYTHON} setup.py sdist && \
                ${PYTHON} -m pip install -U dist/*.tar.gz`;
        }
    } else if (IS_INSTALL) {
        cmd = `${PYTHON} -m pip install . --no-clean`;
    } else {
        cmd = bash`${PYTHON} setup.py build -v`;
    }

    if (IS_DOCKER) {
        execute`${docker(IMAGE)} bash -c "cd python/perspective && \
            ${cmd} "`;
    } else {
        const python_path = resolve`${__dirname}/../python/perspective`;
        execute`cd ${python_path} && ${cmd}`;
    }
} catch (e) {
    console.log(e.message);
    process.exit(1);
}
