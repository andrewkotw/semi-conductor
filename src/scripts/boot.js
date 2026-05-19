/*
Copyright 2019 Google LLC

Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
*/

// Import this or horrible, inexplicable errors happen -- https://github.com/parcel-bundler/parcel/issues/1762
import 'babel-polyfill';

const overlay = document.querySelector('.gesture-start-overlay');
const button = document.querySelector('.gesture-start-button');
const songChoices = document.querySelectorAll('input[name="song-choice"]');

let hasStarted = false;

function updateSelectedSongStyle() {
  songChoices.forEach((choice) => {
    choice.parentNode.classList.toggle('selected', choice.checked);
  });
}

function getSelectedSongId() {
  const selected = Array.prototype.find.call(songChoices, (choice) => choice.checked);
  return selected ? selected.value : 'nachtmusik';
}

async function beginExperience() {
  if (hasStarted) return;
  hasStarted = true;

  button.disabled = true;
  songChoices.forEach((choice) => {
    choice.disabled = true;
  });
  button.innerHTML = '啟動中...';

  try {
    // Load the old app only after a click/tap. Modern Chrome blocks Web Audio
    // contexts that are created or resumed before a user gesture.
    const appModule = require('./main');
    await appModule.startApp(getSelectedSongId());
    overlay.classList.add('hidden');
    setTimeout(() => {
      overlay.parentNode.removeChild(overlay);
    }, 300);
  } catch (error) {
    hasStarted = false;
    button.disabled = false;
    songChoices.forEach((choice) => {
      choice.disabled = false;
    });
    button.innerHTML = '再試一次';
    console.error('Semi-Conductor failed to start:', error);
  }
}

button.addEventListener('click', beginExperience);
button.addEventListener('touchend', (event) => {
  event.preventDefault();
  beginExperience();
});
songChoices.forEach((choice) => {
  choice.addEventListener('change', updateSelectedSongStyle);
});
updateSelectedSongStyle();
