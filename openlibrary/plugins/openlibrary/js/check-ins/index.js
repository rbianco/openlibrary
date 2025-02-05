/**
 * Defines code needed for reading log check-in UI components.
 * @module check-ins/index
 */
import { PersistentToast } from '../Toast'

/**
 * Enum for check-in event types.
 * @readonly
 * @enum {string}
 */
export const CheckInEvent = {
    /** Started reading */
    START: '1',
    /** Update to an existing check-in event */
    UPDATE: '2',
    /** Completed reading */
    FINISH: '3'
}

/**
 * Array of days for each month, listed in order starting with January.
 * Assumes that it is not a leap year.
 */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * Adds listeners to each given check-in component.
 *
 * @param {HTMLCollection<HTMLElement>} elems
 */
export function initCheckInForms(elems) {
    for (const elem of elems) {
        const idField = elem.querySelector('input[name=event_id]')

        const deleteButton = elem.querySelector('.check-in__delete-btn')
        deleteButton.addEventListener('click', function(event) {
            event.preventDefault()
            deleteEvent(elem, elem.dataset.workOlid, idField.value)
        })

        const submitButton = elem.querySelector('.check-in__submit-btn')
        submitButton.addEventListener('click', function(event) {
            event.preventDefault()
            submitEvent(elem)
        })

        const yearSelect = elem.querySelector('select[name=year]')
        yearSelect.addEventListener('change', function(event) {
            onYearChange(elem, event.target.value)
        })

        const monthSelect = elem.querySelector('select[name=month]')
        monthSelect.addEventListener('change', function(event) {
            onMonthChange(elem, event.target.value)
        })

        const todayLink = elem.querySelector('.check-in__today')
        todayLink.addEventListener('click', function() {
            onTodayClick(elem)
        })
    }
}

/**
 * Adds listeners to check-in date prompts.
 *
 * @param {HTMLCollection<HTMLElement>} elems Components that prompt for check-in dates
 */
export function initCheckInPrompts(elems) {
    for (const elem of elems) {
        const workOlid = elem.dataset.workOlid
        const modal = document.querySelector(`#check-in-dialog-${workOlid}`)

        const todayLink = elem.querySelector('.prompt-today')
        todayLink.addEventListener('click', function() {
            onTodayClick(modal, true)
        })

        const customDateLink = elem.querySelector('.prompt-custom')
        customDateLink.addEventListener('click', function() {
            modal.showModal()
        })
    }
}

/**
 * Enables edit date functionality.
 *
 * @param {HTMLElement} elems Edit date buttons
 */
export function initCheckInEdits(elems) {
    for (const elem of elems) {
        elem.addEventListener('click', function() {
            const workOlid = elem.dataset.workOlid
            const modal = document.querySelector(`#check-in-dialog-${workOlid}`)
            modal.showModal()
        })
    }
}

/**
 * Sets check-in form inputs to today's date.
 *
 * Optionally submits form upon setting date.
 *
 * @param {HTMLElement} modal Element containing the check-in form
 * @param {boolean} doSubmit Submits form if true
 */
function onTodayClick(modal, doSubmit=false) {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = now.getDate()

    setDate(modal, year, month, day)
    if (doSubmit) {
        submitEvent(modal.querySelector('.check-in'))
    }
}

/**
 * Sets the date selectors of the given form to the given year, month, and day.
 *
 * @param {HTMLElement} parentElement The root element of the check-in component
 * @param {Number} year Four digit year
 * @param {Number} month One-indexed month
 * @param {Number} day The day
 */
export function setDate(parentElement, year, month, day) {
    const yearSelect = parentElement.querySelector('select[name=year]')
    const monthSelect = parentElement.querySelector('select[name=month]')
    const daySelect = parentElement.querySelector('select[name=day]')
    const submitButton = parentElement.querySelector('.check-in__submit-btn')

    yearSelect.value = year
    monthSelect.value = month
    daySelect.value = day

    let daysInMonth = DAYS_IN_MONTH[month - 1]
    if (month === 2 && isLeapYear(year)) {
        ++daysInMonth
    }

    toggleDayVisibility(daySelect, daysInMonth)

    monthSelect.disabled = false
    daySelect.disabled = false
    submitButton.disabled = false
}

/**
 * Adjusts available options when a new year is selected.
 *
 * If no year is given, the submit button is disabled and month and year selectors
 * are reset and disabled.  Otherwise, the month selector and submit button are enabled.
 *
 * In the event that the year changes to or from a leap year and February is the selected month,
 * the amount of days are adjusted.
 *
 * @param {HTMLElement} parentElement The root element of the check-in component
 * @param {string} value The value of the selected year option
 */
function onYearChange(parentElement, value) {
    const monthSelect = parentElement.querySelector('select[name=month]')
    const daySelect = parentElement.querySelector('select[name=day]')
    const submitButton = parentElement.querySelector('.check-in__submit-btn')

    if (value) {
        monthSelect.disabled = false
        submitButton.disabled = false

        // Adjust for leap years:
        if (monthSelect.value === '2') {
            if (isLeapYear(Number(value))) {
                daySelect.options[29].classList.remove('hidden')
            } else {
                daySelect.options[29].classList.add('hidden')
                if (daySelect.value === '29') {
                    daySelect.value = '28'
                }
            }
        }
    } else {
        daySelect.value = ''
        daySelect.disabled = true
        monthSelect.value = ''
        monthSelect.disabled = true
        submitButton.disabled = true
    }
}

/**
 * Adjusts available options when a new month is selected.
 *
 * Disables and resets day select element if no month is selected.
 * Otherwise, enables day selector and ensures that the correct number
 * of day options are present.
 *
 * @param {HTMLElement} parentElement The root element of the check-in component
 * @param {string} value The value of the selected option
 */
function onMonthChange(parentElement, value) {
    const daySelect = parentElement.querySelector('select[name=day]')

    if (value) {
        const yearSelect = parentElement.querySelector('select[name=year]')
        const year = Number(yearSelect.value)
        const month = Number(value)
        let days = DAYS_IN_MONTH[month - 1]
        if (month === 2 && isLeapYear(year)) {
            ++days
        }

        toggleDayVisibility(daySelect, days)

        daySelect.disabled = false
    } else {
        daySelect.value = ''
        daySelect.disabled = true
    }
}

/**
 * Hides day options that are greater than the number of days in the month.
 *
 * The day `select` element is rendered with 32 `option` elements:
 * Days 1 through 31, and a default option. This function adds the `hidden`
 * class to any day options that are not available for the currently selected
 * month.
 *
 * @param {HTMLSelectElement} daySelect
 * @param {Number} daysInMonth Number of days in the selected month
 */
function toggleDayVisibility(daySelect, daysInMonth) {
    for (let i = 0; i < daySelect.options.length; ++i) {
        if (i <= daysInMonth) {
            daySelect.options[i].classList.remove('hidden')
        } else {
            daySelect.options[i].classList.add('hidden')
        }
    }
}

/**
 * Determines if the given year is a leap year.
 *
 * @param {Number} year
 * @returns `true` if the given year is a leap year.
 */
function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

/**
 * Posts check-in event to the server.
 *
 * @param {HTMLElement} elem The root element of the check-in component
 */
function submitEvent(elem) {
    const eventType = Number(elem.dataset.eventType)
    const url = elem.querySelector('form').action

    const idField = elem.querySelector('input[name=event_id]')
    const id = idField.value

    const editionField = elem.querySelector('input[name=edition_key]')
    const editionKey = editionField ? editionField.value : null

    const dayField = elem.querySelector('select[name=day]')
    const day = dayField.value
    const monthField = elem.querySelector('select[name=month]')
    const month = monthField.value
    const yearField = elem.querySelector('select[name=year]')
    const year = yearField.value

    const data = {
        event_type: Number(eventType),
        year: year ? Number(year) : null,
        month: month ? Number(month) : null,
        day: day ? Number(day) : null,
        event_id: id ? Number(id) : null
    }

    if (editionKey) {
        data.edition_key = editionKey
    }

    $.ajax({
        type: 'POST',
        url: url,
        contentType: 'application/json',
        data: JSON.stringify(data),
        dataType: 'json',
        beforeSend: function(xhr) {
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Accept', 'application/json');
        },
        success: function(data) {
            idField.value = data.id
            showDateView(elem.dataset.workOlid, year, month, day)
            const deleteButton = elem.querySelector('.check-in__delete-btn')
            deleteButton.classList.remove('invisible')
        },
        error: function() {
            new PersistentToast('Failed to submit check-in.  Please try again in a few moments.').show()
        },
        complete: function() {
            closeDialog(elem.dataset.workOlid)
        }
    });
}

/**
 * Dispatches close dialog event to the parent dialog element.
 *
 * @param {string} workOlid Uniquely identifies a check-in dialog element.
 */
function closeDialog(workOlid) {
    const dialog = document.querySelector(`#check-in-dialog-${workOlid}`)
    dialog.dispatchEvent(new Event('close-dialog'))
}

/**
 * Updates and displays check-in date view.
 *
 * Hides check-in prompt component.
 *
 * @param {string} workOlid ID used to identify related components
 * @param {str} year Check-in event year
 * @param {str|null} month Check-in event month
 * @param {str|null} day Check-in event day
 */
function showDateView(workOlid, year, month, day) {
    let date = year
    if (month) {
        date += `-${month}`
        if (day) {
            date += `-${day}`
        }
    }
    const displayElement = document.querySelector(`#check-in-display-${workOlid}`)
    const dateField = displayElement.querySelector('.check-in-date')
    dateField.textContent = date

    const promptElem = document.querySelector(`#prompt-${workOlid}`)
    promptElem.classList.add('hidden')

    displayElement.classList.remove('hidden')
}

/**
 * Hides date display element and shows date prompt element.
 *
 * @param {string} workOlid Part of unique identifier for check-in UI components
 */
function showDatePromptView(workOlid) {
    const promptElem = document.querySelector(`#prompt-${workOlid}`)
    const displayElement = document.querySelector(`#check-in-display-${workOlid}`)
    displayElement.classList.add('hidden')
    promptElem.classList.remove('hidden')
}

/**
 * Deletes record with given event ID, and updates view.
 *
 * @param {HTMLElement} rootElem Root element of check-in form.
 * @param {string} workOlid Uniquely identifies check-in components
 * @param {string} eventId ID of event that is being deleted
 */
function deleteEvent(rootElem, workOlid, eventId) {
    $.ajax({
        type: 'DELETE',
        url: `/check-ins/${eventId}`,
        success: function() {
            const idField = rootElem.querySelector('input[name=event_id]')
            idField.value = ''
            showDatePromptView(workOlid)
            const deleteButton = rootElem.querySelector('.check-in__delete-btn')
            deleteButton.classList.add('invisible')
        },
        error: function() {
            new PersistentToast('Failed to delete check-in.  Please try again in a few moments.').show()
        },
        complete: function() {
            closeDialog(workOlid)
        }
    });
}
