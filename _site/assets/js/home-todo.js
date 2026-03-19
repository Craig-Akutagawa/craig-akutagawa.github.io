(function () {
  const root = document.querySelector("#home-todo-card");
  if (!root) {
    return;
  }

  const STORAGE_KEY = root.dataset.storageKey || "home-todo-v1";
  const form = root.querySelector(".todo-form");
  const input = root.querySelector(".todo-input");
  const list = root.querySelector(".todo-list");
  const empty = root.querySelector(".todo-empty");
  const status = root.querySelector(".todo-status");

  let items = [];
  let editingId = null;
  let storageEnabled = false;

  function canUseStorage() {
    try {
      const probeKey = "__home_todo_probe__";
      window.localStorage.setItem(probeKey, "1");
      window.localStorage.removeItem(probeKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  function readItems() {
    if (!storageEnabled) {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item) => ({
          id: typeof item.id === "string" ? item.id : String(Date.now()),
          text: typeof item.text === "string" ? item.text : "",
          completed: Boolean(item.completed),
          createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
          updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now()
        }))
        .filter((item) => item.text.trim());
    } catch (error) {
      setStatus("Saved TODO data was reset because it could not be read.", true);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (nestedError) {
        // Ignore cleanup failures and continue with an empty list.
      }
      return [];
    }
  }

  function writeItems() {
    if (!storageEnabled) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      setStatus("Local storage is unavailable. Changes will only last until this tab closes.", true);
      storageEnabled = false;
    }
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(message, warn) {
    status.textContent = message || "";
    status.dataset.state = warn ? "warn" : "";
  }

  function itemMarkup(item) {
    const checked = item.completed ? " checked" : "";
    const completedClass = item.completed ? " is-complete" : "";

    if (editingId === item.id) {
      return [
        '<li class="todo-item is-editing" data-id="', item.id, '">',
        '<form class="todo-edit-form">',
        '<input class="todo-edit-input" name="text" type="text" maxlength="180" value="', escapeHtml(item.text), '" aria-label="Edit todo item">',
        '<div class="todo-actions">',
        '<button type="submit" class="todo-action todo-action-save">Save</button>',
        '<button type="button" class="todo-action" data-action="cancel-edit">Cancel</button>',
        '</div>',
        "</form>",
        "</li>"
      ].join("");
    }

    return [
      '<li class="todo-item', completedClass, '" data-id="', item.id, '">',
      '<label class="todo-check">',
      '<input type="checkbox" data-action="toggle"', checked, ' aria-label="Toggle todo item">',
      '<span class="todo-text">', escapeHtml(item.text), "</span>",
      "</label>",
      '<div class="todo-actions">',
      '<button type="button" class="todo-action" data-action="edit">Edit</button>',
      '<button type="button" class="todo-action todo-action-danger" data-action="delete">Delete</button>',
      "</div>",
      "</li>"
    ].join("");
  }

  function render() {
    list.innerHTML = items.map(itemMarkup).join("");
    empty.hidden = items.length > 0;
  }

  function createItem(text) {
    const now = Date.now();
    return {
      id: "todo-" + now + "-" + Math.random().toString(36).slice(2, 8),
      text: text.trim(),
      completed: false,
      createdAt: now,
      updatedAt: now
    };
  }

  function addItem(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      setStatus("Enter a task before adding it.", true);
      return;
    }

    items.push(createItem(trimmed));
    writeItems();
    render();
    form.reset();
    input.focus();
    setStatus("");
  }

  function updateItem(id, updater) {
    items = items.map((item) => {
      if (item.id !== id) {
        return item;
      }

      return updater(item);
    });
    writeItems();
    render();
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    addItem(input.value);
  });

  list.addEventListener("click", function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const itemEl = button.closest(".todo-item");
    if (!itemEl) {
      return;
    }

    const id = itemEl.dataset.id;
    if (!id) {
      return;
    }

    const action = button.dataset.action;
    if (action === "edit") {
      editingId = id;
      render();
      const editInput = list.querySelector('.todo-item[data-id="' + id + '"] .todo-edit-input');
      if (editInput) {
        editInput.focus();
        editInput.select();
      }
      return;
    }

    if (action === "cancel-edit") {
      editingId = null;
      render();
      return;
    }

    if (action === "delete") {
      items = items.filter((item) => item.id !== id);
      if (editingId === id) {
        editingId = null;
      }
      writeItems();
      render();
      setStatus("");
    }
  });

  list.addEventListener("change", function (event) {
    const checkbox = event.target.closest('input[type="checkbox"][data-action="toggle"]');
    if (!checkbox) {
      return;
    }

    const itemEl = checkbox.closest(".todo-item");
    if (!itemEl) {
      return;
    }

    const id = itemEl.dataset.id;
    updateItem(id, function (item) {
      return {
        id: item.id,
        text: item.text,
        completed: checkbox.checked,
        createdAt: item.createdAt,
        updatedAt: Date.now()
      };
    });
    setStatus("");
  });

  list.addEventListener("submit", function (event) {
    const editForm = event.target.closest(".todo-edit-form");
    if (!editForm) {
      return;
    }

    event.preventDefault();

    const itemEl = editForm.closest(".todo-item");
    const editInput = editForm.querySelector(".todo-edit-input");
    if (!itemEl || !editInput) {
      return;
    }

    const nextText = editInput.value.trim();
    if (!nextText) {
      setStatus("Edited tasks cannot be empty.", true);
      editInput.focus();
      return;
    }

    const id = itemEl.dataset.id;
    editingId = null;
    updateItem(id, function (item) {
      return {
        id: item.id,
        text: nextText,
        completed: item.completed,
        createdAt: item.createdAt,
        updatedAt: Date.now()
      };
    });
    setStatus("");
  });

  storageEnabled = canUseStorage();
  if (!storageEnabled) {
    setStatus("This browser cannot persist local TODO items. Changes will not survive a reload.", true);
  }

  items = readItems();
  render();
})();
