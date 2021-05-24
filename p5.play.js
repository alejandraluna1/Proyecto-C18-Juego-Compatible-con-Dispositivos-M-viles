/*
p5.play
por Paolo Pedercini/molleindustria, 2015
http://molleindustria.org/
*/

(function(root, factory) {
if (typeof define === 'function' && define.amd)
define('p5.play', ['@code-dot-org/p5'], function(p5) { (factory(p5)); });
else if (typeof exports === 'object')
factory(require('@code-dot-org/p5'));
else
factory(root.p5);
}(this, function(p5) {
/**
 * p5.play es una biblioteca para p5.js para facilitar la creación de juegos y proyectos
 * similares.
 *
 * Proporciona una clase Sprite flexible para administrar objetos visuales en el espacio 2D
 * y características como soporte de animación, detección básica de colisiones
 * y resolución, interacciones con el ratón y el teclado, y una cámara virtual.
 *
 * p5.play no es un motor físico derivado de box2D, no usa eventos y es
 * diseñado para ser entendido y posiblemente modificado por programadores intermedios.
 *
 * Consulta la carpeta de ejemplos para obtener más información sobre cómo utilizar esta biblioteca.
 *
 * @module p5.play
 * @submodule p5.play
 * @for p5.play
 * @main
 */

// =============================================================================
//                         Inicialización
// =============================================================================

var DEFAULT_FRAME_RATE = 30;

// Esta es la nueva forma de inicializar propiedades p5 personalizadas para cualquier instancia en p5.
// El objetivo es migrar las propiedades perezosas de P5 a este método.
// @see https://github.com/molleindustria/p5.play/issues/46
p5.prototype.registerMethod('init', function p5PlayInit() {
  /**
   * La cámara de bocetos se crea automáticamente al comienzo de un boceto.
   * Una cámara facilita el desplazamiento y el zoom para escenas que se extienden más allá
   * del lienzo. Una cámara tiene una posición, un factor de zoom y el ratón
   * coordina relativas a la vista.
   *
   * En términos de p5.js, la cámara envuelve todo el ciclo de dibujo en una
   * matriz de transformación, pero se puede desactivar en cualquier momento durante el ciclo de
   * dibujo, por ejemplo para dibujar elementos de interfaz en una posición absoluta.
   *
   * @property camera   @propiedad cámara
   * @type {camera}     @tipo {cámara}
   */
  this.camera = new Camera(this, 0, 0, 1);
  this.camera.init = false;

  this.angleMode(this.DEGREES);
  this.frameRate(DEFAULT_FRAME_RATE);

  this._defaultCanvasSize = {
    width: 400,
    height: 400
  };

  var startDate = new Date();
  this._startTime = startDate.getTime();

  // Lienzo temporal para soportar operaciones de tinte a partir de elementos de imagenes;
  // mira p5.prototype.imageElement()
  this._tempCanvas = document.createElement('canvas');
});

// Esto nos proporciona una forma de definir perezosamente propiedades que
// son globales para instancias p5.
//
// Ten en cuenta que esto no es solo una optimización: p5 actualmente no proporciona
// una forma de que se notifique a los complementos cuando se creen nuevas instancias p5, por lo que
// la creación perezosa de estas propiedades es el * único * mecanismo disponible
// para nosotros. Para más información, visita:
//
// https://github.com/processing/p5.js/issues/1263
function defineLazyP5Property(name, getter) {
  Object.defineProperty(p5.prototype, name, {
    configurable: true,
    enumerable: true,
    get: function() {
      var context = (this instanceof p5 && !this._isGlobal) ? this : window;

      if (typeof(context._p5PlayProperties) === 'undefined') {
        context._p5PlayProperties = {};
      }
      if (!(name in context._p5PlayProperties)) {
        context._p5PlayProperties[name] = getter.call(context);
      }
      return context._p5PlayProperties[name];
    }
  });
}

// Esto devuelve una función de fábrica, adecuada para pasar a
// defineLazyP5Property, que devuelve una sublclase del constructor
// dado, que siempre está vinculado a una instancia p5 particular.
function boundConstructorFactory(constructor) {
  if (typeof(constructor) !== 'function')
    throw new Error('el constructor debe ser una función');

  return function createBoundConstructor() {
    var pInst = this;

    function F() {
      var args = Array.prototype.slice.call(arguments);

      return constructor.apply(this, [pInst].concat(args));
    }
    F.prototype = constructor.prototype;

    return F;
  };
}

// Esta es una utilidad que facilita la definición de alias convenientes para
// métodos de instancia de p5 pre-enlazados.
//
// Por ejemplo:
//
//   var pInstBind = createPInstBinder(pInst);
//
//   var createVector = pInstBind('createVector');
//   var loadImage = pInstBind('loadImage');
//
// Lo anterior creará funciones createVector y loadImage, que pueden ser
// usadas de manera similar al modo global p5; sin embargo, están vinculadas a instancias p5 
// específicas,  y por lo tanto se puede usar fuera del modo global.
function createPInstBinder(pInst) {
  return function pInstBind(methodName) {
    var method = pInst[methodName];

    if (typeof(method) !== 'function')
      throw new Error('"' + methodName + '" no es un método p5');
    return method.bind(pInst);
  };
}

// Estas son funciones de utilidad p5 que no dependen del estado de la instancia p5
// para que funcionen correctamente, así que seguiremos adelante y facilitaremos su
// accesso sin necesidad de vincularlas a una instancia p5.
var abs = p5.prototype.abs;
var radians = p5.prototype.radians;
var degrees = p5.prototype.degrees;

// =============================================================================
//                        anulación p5
// =============================================================================

// Establece el color de relleno predeterminado en gris (127, 127, 127) cada vez que se crea un nuevo
// lienzo.
if (!p5.prototype.originalCreateCanvas_) {
  p5.prototype.originalCreateCanvas_ = p5.prototype.createCanvas;
  p5.prototype.createCanvas = function() {
    var result = this.originalCreateCanvas_.apply(this, arguments);
    this.fill(this.color(127, 127, 127));
    return result;
  };
}

// Haz que el ancho y el alto sean opcionales para elipse () - predeterminado en 50
// Guarda la implementación original para permitir parámetros opcionales.
if (!p5.prototype.originalEllipse_) {
  p5.prototype.originalEllipse_ = p5.prototype.ellipse;
  p5.prototype.ellipse = function(x, y, w, h) {
    w = (w) ? w : 50;
    h = (w && !h) ? w : h;
    this.originalEllipse_(x, y, w, h);
  };
}

// Haz que el ancho y el alto sean opcionales para rect () - predeterminado en 50
// Guarda la implementación original para permitir parámetros opcionales.
if (!p5.prototype.originalRect_) {
  p5.prototype.originalRect_ = p5.prototype.rect;
  p5.prototype.rect = function(x, y, w, h) {
    w = (w) ? w : 50;
    h = (w && !h) ? w : h;
    this.originalRect_(x, y, w, h);
  };
}

// Modifica p5 para ignorar las posiciones fuera de límites antes de configurar touchIsDown
p5.prototype._ontouchstart = function(e) {
  if (!this._curElement) {
    return;
  }
  var validTouch;
  for (var i = 0; i < e.touches.length; i++) {
    validTouch = getTouchInfo(this._curElement.elt, e, i);
    if (validTouch) {
      break;
    }
  }
  if (!validTouch) {
    // No hay toques dentro de los límites (válidos), regresa e ignora:
    return;
  }
  var context = this._isGlobal ? window : this;
  var executeDefault;
  this._updateNextTouchCoords(e);
  this._updateNextMouseCoords(e);
  this._setProperty('touchIsDown', true);
  if (typeof context.touchStarted === 'function') {
    executeDefault = context.touchStarted(e);
    if (executeDefault === false) {
      e.preventDefault();
    }
  } else if (typeof context.mousePressed === 'function') {
    executeDefault = context.mousePressed(e);
    if (executeDefault === false) {
      e.preventDefault();
    }
    //this._setMouseButton(e);
  }
};

// Modifica p5 para manejar las transformaciones CSS (escala), e ignora las posiciones fuera del
// límite antes de informar las coordenadas táctiles
//
// NOTA: _updateNextTouchCoords () es casi idéntico, pero llama a una función modificada
// getTouchInfo() que escala la posición táctil con el espacio
// del juego, y puede devolver indefinido
p5.prototype._updateNextTouchCoords = function(e) {
  var x = this.touchX;
  var y = this.touchY;
  if (e.type === 'mousedown' || e.type === 'mousemove' ||
      e.type === 'mouseup' || !e.touches) {
    x = this.mouseX;
    y = this.mouseY;
  } else {
    if (this._curElement !== null) {
      var touchInfo = getTouchInfo(this._curElement.elt, e, 0);
      if (touchInfo) {
        x = touchInfo.x;
        y = touchInfo.y;
      }

      var touches = [];
      var touchIndex = 0;
      for (var i = 0; i < e.touches.length; i++) {
        // Solo algunos toques son válidos - solo presione toques válidos en el arreglo 
        // de la matriz para matriz para la propiedad `touch`
        touchInfo = getTouchInfo(this._curElement.elt, e, i);
        if (touchInfo) {
          touches[touchIndex] = touchInfo;
          touchIndex++;
        }
      }
      this._setProperty('touches', touches);
    }
  }
  this._setProperty('touchX', x);
  this._setProperty('touchY', y);
  if (!this._hasTouchInteracted) {
    // Para el primer dibujo, haz que el anterior y el siguiente sean iguales
    this._updateTouchCoords();
    this._setProperty('_hasTouchInteracted', true);
  }
};

// NOTA: devuelve indefinido si la posición está fuera del rango válido
function getTouchInfo(canvas, e, i) {
  i = i || 0;
  var rect = canvas.getBoundingClientRect();
  var touch = e.touches[i] || e.changedTouches[i];
  var xPos = touch.clientX - rect.left;
  var yPos = touch.clientY - rect.top;
  if (xPos >= 0 && xPos < rect.width && yPos >= 0 && yPos < rect.height) {
    return {
      x: Math.round(xPos * canvas.offsetWidth / rect.width),
      y: Math.round(yPos * canvas.offsetHeight / rect.height),
      id: touch.identifier
    };
  }
}

// Modifica p5 para ignorar las posiciones fuera de límites antes de configurar mouseIsPressed
// y isMousePressed
p5.prototype._onmousedown = function(e) {
  if (!this._curElement) {
    return;
  }
  if (!getMousePos(this._curElement.elt, e)) {
    // No está dentro de los límites, regresa e ignora:
    return;
  }
  var context = this._isGlobal ? window : this;
  var executeDefault;
  this._setProperty('isMousePressed', true);
  this._setProperty('mouseIsPressed', true);
  this._setMouseButton(e);
  this._updateNextMouseCoords(e);
  this._updateNextTouchCoords(e);
  if (typeof context.mousePressed === 'function') {
    executeDefault = context.mousePressed(e);
    if (executeDefault === false) {
      e.preventDefault();
    }
  } else if (typeof context.touchStarted === 'function') {
    executeDefault = context.touchStarted(e);
    if (executeDefault === false) {
      e.preventDefault();
    }
  }
};

// Modifica p5 para manejar las transformaciones CSS (escala) e ignorar las posiciones
// fuera de límites antes de informar las coordenadas del ratón
//
// NOTA: _updateNextMouseCoords () es casi idéntico, pero llama debajo a una función modificada
// getMousePos() que escala la posición del espacio del juego
// y puede devolver indefinido.
p5.prototype._updateNextMouseCoords = function(e) {
  var x = this.mouseX;
  var y = this.mouseY;
  if (e.type === 'touchstart' || e.type === 'touchmove' ||
      e.type === 'touchend' || e.touches) {
    x = this.touchX;
    y = this.touchY;
  } else if (this._curElement !== null) {
    var mousePos = getMousePos(this._curElement.elt, e);
    if (mousePos) {
      x = mousePos.x;
      y = mousePos.y;
    }
  }
  this._setProperty('mouseX', x);
  this._setProperty('mouseY', y);
  this._setProperty('winMouseX', e.pageX);
  this._setProperty('winMouseY', e.pageY);
  if (!this._hasMouseInteracted) {
    // Para el primer dibujo, haz que el anterior y el siguiente sean iguales
    this._updateMouseCoords();
    this._setProperty('_hasMouseInteracted', true);
  }
};

// NOTA: devuelve indefinido si la posición está fuera del rango válido
function getMousePos(canvas, evt) {
  var rect = canvas.getBoundingClientRect();
  var xPos = evt.clientX - rect.left;
  var yPos = evt.clientY - rect.top;
  if (xPos >= 0 && xPos < rect.width && yPos >= 0 && yPos < rect.height) {
    return {
      x: Math.round(xPos * canvas.offsetWidth / rect.width),
      y: Math.round(yPos * canvas.offsetHeight / rect.height)
    };
  }
}

// =============================================================================
//                         extensiones p5
// TODO: Estaría geniial que se aceptaran en la p5.
// =============================================================================

/**
 * Proyecta un vector en la línea paralela a un segundo vector, dando un tercer
 * vector que es la proyección ortogonal de ese vector sobre la línea.
 * @see https://en.wikipedia.org/wiki/Vector_projection
 * @method project
 * @for p5.Vector
 * @static
 * @param {p5.Vector} a - vector que se proyecta
 * @param {p5.Vector} b - vector que define la línea objetivo de proyección.
 * @return {p5.Vector} projection of a onto the line parallel to b.
 */
p5.Vector.project = function(a, b) {
  return p5.Vector.mult(b, p5.Vector.dot(a, b) / p5.Vector.dot(b, b));
};

/**
 * Pregunta si un vector es paralelo a éste.
 * @method isParallel
 * @for p5.Vector
 * @param {p5.Vector} v2
 * @param {number} [tolerance] - margen de error para las comparaciones, entra en
 *        juego al comparar vectores rotados. Por ejemplo, queremos
 *        <1, 0> que sea paralelo a <0, 1>.rot(Math.PI/2) pero la imprecisión flotante
 *        puede interferir con eso.
 * @return {boolean}
 */
p5.Vector.prototype.isParallel = function(v2, tolerance) {
  tolerance = typeof tolerance === 'number' ? tolerance : 1e-14;
  return (
      Math.abs(this.x) < tolerance && Math.abs(v2.x) < tolerance
    ) || (
      Math.abs(this.y ) < tolerance && Math.abs(v2.y) < tolerance
    ) || (
      Math.abs(this.x / v2.x - this.y / v2.y) < tolerance
    );
};

// =============================================================================
//                         adiciones p5
// =============================================================================

/**
 * Carga una imagen de una ruta y crea una imagen a partir de ella.
 * <br><br>
 * Es posible que la imagen no esté disponible inmediatamente para renderizar
 * Si deseas asegurarse de que la imagen esté lista antes de hacer
 * cualquier cosa con ella, coloca la loadImageElement() llamada en preload().
 * También puedes proporcionar una función de devolución de llamada para manejar la imagen cuando esté lista.
 * <br><br>
 * La ruta a la imagen debe ser relativa al archivo HTML
 * que enlaza en tu boceto. Cargando un desde una URL u otra
 * ubicación remota, puede estar bloqueada debido a la seguridad integrada
 * de tu navegador.
 *
 * @method loadImageElement
 * @param  {String} path Ruta de la imagen a cargar
 * @param  {Function(Image)} [successCallback] Función a llamar una vez que la
 *                                imagen está cargada. Se pasará la
 *                                Imagen.
 * @param  {Function(Event)}    [failureCallback] llamada con error de evento si
 *                                la imagen falla al cargar.
 * @return {Image}                el objeto Imagen 
 */
p5.prototype.loadImageElement = function(path, successCallback, failureCallback) {
  var img = new Image();
  var decrementPreload = p5._getDecrementPreload.apply(this, arguments);

  img.onload = function() {
    if (typeof successCallback === 'function') {
      successCallback(img);
    }
    if (decrementPreload && (successCallback !== decrementPreload)) {
      decrementPreload();
    }
  };
  img.onerror = function(e) {
    p5._friendlyFileLoadError(0, img.src);
    // no mezcles la devolución de llamada de falla con decrementPreload
    if ((typeof failureCallback === 'function') &&
      (failureCallback !== decrementPreload)) {
      failureCallback(e);
    }
  };

  //establece crossOrigin en caso de que se sirva una imagen con encabezados CORS
  //esto nos permitirá dibujar sobre el lienzo sin mancharlo.
  //mira https://developer.mozilla.org/en-US/docs/HTML/CORS_Enabled_Image
  // Al usar data-uris, el archivo se cargará localmente
  // por lo que no tenemos que preocuparnos por crossOrigin con tipos de archivos base64
  if(path.indexOf('data:image/') !== 0) {
    img.crossOrigin = 'Anonymous';
  }

  //empieza a cargar la imagen
  img.src = path;

  return img;
};

/**
 * Dibuja un elemento de imagen en el lienzo principal del boceto de p5js
 *
 * @method imageElement
 * @param  {Image}    imgEl    la imagen para mostrar
 * @param  {Number}   [sx=0]   La coordenada X de la esquina superior izquierda del
 *                             sub-rectángulo de la imagen de origen para dibujar en
 *                             el lienzo de destino.
 * @param  {Number}   [sy=0]   La coordenada Y de la esquina superior izquierda del
 *                             sub-rectángulo de la imagen de origen para dibujar en
 *                             el lienzo de destino.
 * @param {Number} [sWidth=imgEl.width] El ancho del sub-rectángulo de la
 *                                      imagen de origen para dibujar en 
 *                                      el lienzo de destino.
 * @param {Number} [sHeight=imgEl.height] La altura del sub-rectángulo de la
 *                                        imagen de origen para dibujar en el
 *                                        contexto de destino.
 * @param  {Number}   [dx=0]    La coordenada X en el lienzo de destino en el 
 *                              cuál colocar en la esquina superior izquierda de la
 *                              imagen de origen.
 * @param  {Number}   [dy=0]    La coordenada Y en el lienzo de destino en el 
 *                              cuál colocar en la esquina superior izquierda de la
 *                              imagen de origen.
 * @param  {Number}   [dWidth]  El ancho para dibujar la imagen en el lienzo de
 *                              destino. Esto permite escalar la imagen dibujada.
 * @param  {Number}   [dHeight] La altura para dibujar la imagen en el lienzo
 *                              de destino. Esto permite escalar la imagen dibujada.
 * @example
 * <div>
 * <code>
 * var imgEl;
 * function preload() {
 *   imgEl = loadImageElement("assets/laDefense.jpg");
 * }
 * function setup() {
 *   imageElement(imgEl, 0, 0);
 *   imageElement(imgEl, 0, 0, 100, 100);
 *   imageElement(imgEl, 0, 0, 100, 100, 0, 0, 100, 100);
 * }
 * </code>
 * </div>
 * <div>
 * <code>
 * function setup() {
 *   // aquí usamos una devolución de llamada para mostrar la imagen después de cargarla
 *   loadImageElement("assets/laDefense.jpg", function(imgEl) {
 *     imageElement(imgEl, 0, 0);
 *   });
 * }
 * </code>
 * </div>
 *
 * @alt
 * imagen de la parte inferior de un paraguas blanco, y de un techo a rayas encima
 * imagen de la parte inferior de un paraguas blanco, y de un techo a rayas encima
 *
 */
p5.prototype.imageElement = function(imgEl, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
  /**
   * Valida los parámetros de recorte. Según las especificaciones de drawImage, sWidth y sHight no pueden serr
   * negativos o mayor que el ancho y alto intrínsecos de la imagen
   * @private
   * @param {Number} sVal
   * @param {Number} iVal
   * @returns {Number}
   * @private
   */
  function _sAssign(sVal, iVal) {
    if (sVal > 0 && sVal < iVal) {
      return sVal;
    }
    else {
      return iVal;
    }
  }

  function modeAdjust(a, b, c, d, mode) {
    if (mode === p5.prototype.CORNER) {
      return {x: a, y: b, w: c, h: d};
    } else if (mode === p5.prototype.CORNERS) {
      return {x: a, y: b, w: c-a, h: d-b};
    } else if (mode === p5.prototype.RADIUS) {
      return {x: a-c, y: b-d, w: 2*c, h: 2*d};
    } else if (mode === p5.prototype.CENTER) {
      return {x: a-c*0.5, y: b-d*0.5, w: c, h: d};
    }
  }

  if (arguments.length <= 5) {
    dx = sx || 0;
    dy = sy || 0;
    sx = 0;
    sy = 0;
    dWidth = sWidth || imgEl.width;
    dHeight = sHeight || imgEl.height;
    sWidth = imgEl.width;
    sHeight = imgEl.height;
  } else if (arguments.length === 9) {
    sx = sx || 0;
    sy = sy || 0;
    sWidth = _sAssign(sWidth, imgEl.width);
    sHeight = _sAssign(sHeight, imgEl.height);

    dx = dx || 0;
    dy = dy || 0;
    dWidth = dWidth || imgEl.width;
    dHeight = dHeight || imgEl.height;
  } else {
    throw 'Wrong number of arguments to imageElement()';
  }

  var vals = modeAdjust(dx, dy, dWidth, dHeight,
    this._renderer._imageMode);

  if (this._renderer._tint) {
    // Crear / dibujar justo a tiempo en un lienzo temporal para que el teñido pueda
    // trabaja dentro del renderizador como lo haría para una p5.Imagen
    // Solo cambia el tamaño del lienzo si es demasiado pequeño
    var context = this._tempCanvas.getContext('2d');
    if (this._tempCanvas.width < vals.w || this._tempCanvas.height < vals.h) {
      this._tempCanvas.width = Math.max(this._tempCanvas.width, vals.w);
      this._tempCanvas.height = Math.max(this._tempCanvas.height, vals.h);
    } else {
      context.clearRect(0, 0, vals.w, vals.h);
    }
    context.drawImage(imgEl,
      sx, sy, sWidth, sHeight,
      0, 0, vals.w, vals.h);
    // Llama al método image() del renderizador con un objeto que contenga la imagen
    // como una propiedad 'elt', y también el lienzo temporal (cuando sea necesario):
    this._renderer.image({canvas: this._tempCanvas},
      0, 0, vals.w, vals.h,
      vals.x, vals.y, vals.w, vals.h);
  } else {
    this._renderer.image({elt: imgEl},
      sx, sy, sWidth, sHeight,
      vals.x, vals.y, vals.w, vals.h);
  }
};

/**
* Un grupo que contiene todos los sprites del boceto.
*
* @property allSprites
* @for p5.play
* @type {Group}
*/

defineLazyP5Property('allSprites', function() {
  return new p5.prototype.Group();
});

p5.prototype._mouseButtonIsPressed = function(buttonCode) {
  return (this.mouseIsPressed && this.mouseButton === buttonCode) ||
    (this.touchIsDown && buttonCode === this.LEFT);
};

p5.prototype.mouseDidMove = function() {
  return this.pmouseX !== this.mouseX || this.pmouseY !== this.mouseY;
};

p5.prototype.mouseIsOver = function(sprite) {
  if (!sprite) {
    return false;
  }

  if (!sprite.collider) {
    sprite.setDefaultCollider();
  }

  var mousePosition;
  if (this.camera.active) {
    mousePosition = this.createVector(this.camera.mouseX, this.camera.mouseY);
  } else {
    mousePosition = this.createVector(this.mouseX, this.mouseY);
  }

  return sprite.collider.overlap(new window.p5.PointCollider(mousePosition));
};

p5.prototype.mousePressedOver = function(sprite) {
  return (this.mouseIsPressed || this.touchIsDown) && this.mouseIsOver(sprite);
};

var styleEmpty = 'rgba(0,0,0,0)';

p5.Renderer2D.prototype.regularPolygon = function(x, y, sides, size, rotation) {
  var ctx = this.drawingContext;
  var doFill = this._doFill, doStroke = this._doStroke;
  if (doFill && !doStroke) {
    if (ctx.fillStyle === styleEmpty) {
      return this;
    }
  } else if (!doFill && doStroke) {
    if (ctx.strokeStyle === styleEmpty) {
      return this;
    }
  }
  if (sides < 3) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + size * Math.cos(rotation), y + size * Math.sin(rotation));
  for (var i = 1; i < sides; i++) {
    var angle = rotation + (i * 2 * Math.PI / sides);
    ctx.lineTo(x + size * Math.cos(angle), y + size * Math.sin(angle));
  }
  ctx.closePath();
  if (doFill) {
    ctx.fill();
  }
  if (doStroke) {
    ctx.stroke();
  }
};

p5.prototype.regularPolygon = function(x, y, sides, size, rotation) {
  if (!this._renderer._doStroke && !this._renderer._doFill) {
    return this;
  }
  var args = new Array(arguments.length);
  for (var i = 0; i < args.length; ++i) {
    args[i] = arguments[i];
  }

  if (typeof rotation === 'undefined') {
    rotation = -(Math.PI / 2);
    if (0 === sides % 2) {
      rotation += Math.PI / sides;
    }
  } else if (this._angleMode === this.DEGREES) {
    rotation = this.radians(rotation);
  }

  // NOTA: solo implementado para no 3D
  if (!this._renderer.isP3D) {
    this._validateParameters(
      'regularPolygon',
      args,
      [
        ['Number', 'Number', 'Number', 'Number'],
        ['Number', 'Number', 'Number', 'Number', 'Number']
      ]
    );
    this._renderer.regularPolygon(
      args[0],
      args[1],
      args[2],
      args[3],
      rotation
    );
  }
  return this;
};

p5.Renderer2D.prototype.shape = function() {
  var ctx = this.drawingContext;
  var doFill = this._doFill, doStroke = this._doStroke;
  if (doFill && !doStroke) {
    if (ctx.fillStyle === styleEmpty) {
      return this;
    }
  } else if (!doFill && doStroke) {
    if (ctx.strokeStyle === styleEmpty) {
      return this;
    }
  }
  var numCoords = arguments.length / 2;
  if (numCoords < 1) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(arguments[0], arguments[1]);
  for (var i = 1; i < numCoords; i++) {
    ctx.lineTo(arguments[i * 2], arguments[i * 2 + 1]);
  }
  ctx.closePath();
  if (doFill) {
    ctx.fill();
  }
  if (doStroke) {
    ctx.stroke();
  }
};

p5.prototype.shape = function() {
  if (!this._renderer._doStroke && !this._renderer._doFill) {
    return this;
  }
  // NOTA: solo implementado para no 3D
  if (!this._renderer.isP3D) {
    // TODO: llama a this._validateParameters, una vez que esté funcionando en p5.js y
    // entendemos si se puede usar para funciones var args como esta
    this._renderer.shape.apply(this._renderer, arguments);
  }
  return this;
};

p5.prototype.rgb = function(r, g, b, a) {
  // convierte a de 0 a 255 a 0 a 1
  if (!a) {
    a = 1;
  }
  a = a * 255;

  return this.color(r, g, b, a);
};

p5.prototype.createGroup = function() {
  return new this.Group();
};

defineLazyP5Property('World', function() {
  var World = {
    pInst: this
  };

  function createReadOnlyP5PropertyAlias(name) {
    Object.defineProperty(World, name, {
      enumerable: true,
      get: function() {
        return this.pInst[name];
      }
    });
  }

  createReadOnlyP5PropertyAlias('width');
  createReadOnlyP5PropertyAlias('height');
  createReadOnlyP5PropertyAlias('mouseX');
  createReadOnlyP5PropertyAlias('mouseY');
  createReadOnlyP5PropertyAlias('allSprites');
  createReadOnlyP5PropertyAlias('frameCount');

  Object.defineProperty(World, 'frameRate', {
    enumerable: true,
    get: function() {
      return this.pInst.frameRate();
    },
    set: function(value) {
      this.pInst.frameRate(value);
    }
  });

  Object.defineProperty(World, 'seconds', {
    enumerable: true,
    get: function() {
      var currentDate = new Date();
      var currentTime = currentDate.getTime();
      return Math.round((currentTime - this.pInst._startTime) / 1000);
    }
  });

  return World;
});

p5.prototype.spriteUpdate = true;

/**
   * Un Sprite es el componente principal de p5.play
   * un elemento capaz de almacenar imágenes o animaciones con un conjunto de
   * propiedades como posición y visibilidad.
   * Un Sprite puede tener un colisionador que define el área activa para detectar
   * colisiones o superposiciones con otros sprites e interacciones del ratón.
   *
   * Los Sprites creados con createSprite (la forma preferida) se agregan al
   * grupo allSprites y se le da un valor de profundidad que lo coloca al frente de todos
   * los otros sprites.
   *
   * @method createSprite
   * @param {Number} x Coordenada x inicial
   * @param {Number} y Coordenada y inicial
   * @param {Number} width Ancho del rectángulo del marcador de posición y del
   *                       colisionador hasta que se establezca una imagen o un nuevo colisionador
   * @param {Number} height Altura del rectángulo del marcador de posición y del
   *                       colisionador hasta que se establezca una imagen o un nuevo colisionador
   * @return {Object} La nueva instancia del sprite
   */

p5.prototype.createSprite = function(x, y, width, height) {
  var s = new Sprite(this, x, y, width, height);
  s.depth = this.allSprites.maxDepth()+1;
  this.allSprites.add(s);
  return s;
};


/**
   * Elimina un Sprite del boceto.
   * El Sprite eliminado ya no se dibujará ni actualizará.
   * Equivalente a Sprite.remove()
   *
   * @method removeSprite
   * @param {Object} sprite Sprite que se eliminará
*/
p5.prototype.removeSprite = function(sprite) {
  sprite.remove();
};

/**
* Actualiza todos los sprites en el boceto (posición, animación ...)
* se llama automáticamente en cada draw().
* Se puede pausar pasando un parámetro verdadero o falso;
* Nota: no renderiza los sprites.
*
* @method updateSprites
* @param {Boolean} actualizando falso para pausar la actualización, verdadero para reanudar
*/
p5.prototype.updateSprites = function(upd) {

  if(upd === false)
    this.spriteUpdate = false;
  if(upd === true)
    this.spriteUpdate = true;

  if(this.spriteUpdate)
  for(var i = 0; i<this.allSprites.size(); i++)
  {
    this.allSprites.get(i).update();
  }
};

/**
* Rdevuelve todos los sprites en el boceto como una matriz
*
* @method getSprites
* @return {Array} Matriz de Sprites
*/
p5.prototype.getSprites = function() {

  //dibuja todo 
  if(arguments.length===0)
  {
    return this.allSprites.toArray();
  }
  else
  {
    var arr = [];
    //para cada etiqueta
    for(var j=0; j<arguments.length; j++)
    {
      for(var i = 0; i<this.allSprites.size(); i++)
      {
        if(this.allSprites.get(i).isTagged(arguments[j]))
          arr.push(this.allSprites.get(i));
      }
    }

    return arr;
  }

};

/**
* Displays a Group of sprites.
* Si no se especifica ningún parámetro, dibuja todos los sprites en el
* boceto.
* El orden de dibujo está determinado por la propiedad Sprite "profundidad"
*
* @method drawSprites
* @param {Group} [group] Grupo de Sprites que se mostrarán
*/
p5.prototype.drawSprites = function(group) {
  // Si no se proporciona ningún grupo, dibuja el grupo allSprites.
  group = group || this.allSprites;

  if (typeof group.draw !== 'function')
  {
    throw('Error: with drawSprites you can only draw all sprites or a group');
  }

  group.draw();
};

/**
* Muestra un Sprite.
* Se utiliza normalmente en la función de dibujo principal.
*
* @method drawSprite
* @param {Sprite} sprite Sprite que se mostrará
*/
p5.prototype.drawSprite = function(sprite) {
  if(sprite)
  sprite.display();
};

/**
* Carga una animación.
* Se utiliza normalmente en la función preload() del boceto.
*
* @method loadAnimation
* @param {Sprite} sprite Sprite que se mostrará
*/
p5.prototype.loadAnimation = function() {
  return construct(this.Animation, arguments);
};

/**
 * Carga una Hoja de Sprite.
 * Para ser usado típicamente en la función preload() del boceto.
 *
 * @method loadSpriteSheet
 */
p5.prototype.loadSpriteSheet = function() {
  return construct(this.SpriteSheet, arguments);
};

/**
* Muestra una animación.
*
* @method animation
* @param {Animation} anim Animación que se mostrará
* @param {Number} x coordenada X 
* @param {Number} y coordenada Y 
*
*/
p5.prototype.animation = function(anim, x, y) {
  anim.draw(x, y);
};

//variable para detectar una presión instantánea
defineLazyP5Property('_p5play', function() {
  return {
    keyStates: {},
    mouseStates: {}
  };
});

var KEY_IS_UP = 0;
var KEY_WENT_DOWN = 1;
var KEY_IS_DOWN = 2;
var KEY_WENT_UP = 3;

/**
* Detecta si se presionó una tecla durante el último ciclo.
* Se puede usar para activar eventos una vez, cuando se presiona o suelta una tecla.
* Ejemplo: Super Mario saltando.
*
* @method keyWentDown
* @param {Number|String} key Código clave o caracter
* @return {Boolean} Verdadero si se presionó la tecla
*/
p5.prototype.keyWentDown = function(key) {
  return this._isKeyInState(key, KEY_WENT_DOWN);
};


/**
* Detecta si se soltó una tecla durante el último ciclo.
* Se puede usar para activar eventos una vez, cuando se presiona o suelta una tecla.
* Ejemplo: Disparo de una nave espacial.
*
* @method keyWentUp
* @param {Number|String} key Código clave o caracter
* @return {Boolean} Verdadero si se presionó la tecla
*/
p5.prototype.keyWentUp = function(key) {
  return this._isKeyInState(key, KEY_WENT_UP);
};

/**
* Detecta si una tecla está presionada actualmente
* Como p5 keyIsDown pero acepta cadenas y códigos
*
* @method keyDown
* @param {Number|String} key Código clave o caracter
* @return {Boolean} Verdadero si se presionó la tecla
*/
p5.prototype.keyDown = function(key) {
  return this._isKeyInState(key, KEY_IS_DOWN);
};

/**
* Detecta si una tecla está en el estado dado durante el último ciclo.
 * Método auxiliar que encapsula la lógica de estado de clave común; puede ser preferible
 * para llamar a keyDown u otros métodos directamente.
 *
 * @private
 * @method _isKeyInState
 * @param {Number|String} key Código clave o caracter
 * @param {Number} state Estado clave para verificar
 * @return {Boolean} Verdadero si la clave está en el estado dado
 */
p5.prototype._isKeyInState = function(key, state) {
  var keyCode;
  var keyStates = this._p5play.keyStates;

  if(typeof key === 'string')
  {
    keyCode = this._keyCodeFromAlias(key);
  }
  else
  {
    keyCode = key;
  }

  //si no está definido, empieza a comprobarlo
  if(keyStates[keyCode]===undefined)
  {
    if(this.keyIsDown(keyCode))
      keyStates[keyCode] = KEY_IS_DOWN;
    else
      keyStates[keyCode] = KEY_IS_UP;
  }

  return (keyStates[keyCode] === state);
};

/**
* Detecta si un botón del ratón está presionado actualmente
* Combina mouseIsPressed y mouseButton de p5
*
* @method mouseDown
* @param {Number} [buttonCode] Botón del ratón constante IZQUIERDA, DERECHA o CENTRO
* @return {Boolean} Verdadero si el botón está presionado
*/
p5.prototype.mouseDown = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_IS_DOWN);
};

/**
* Detecta si un botón del ratón está presionado actualmente
* Combina mouseIsPressed y mouseButton de p5
*
* @method mouseUp
* @param {Number} [buttonCode] El botón del ratón constante IZQUIERDA, DERECHA o CENTRO
* @return {Boolean} Verdadero si el botón está presionado
*/
p5.prototype.mouseUp = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_IS_UP);
};

/**
 * Detecta si un botón del ratón se soltó durante el último ciclo.
 * Se puede usar para activar eventos una vez, para checarse en el ciclo de dibujo
 *
 * @method mouseWentUp
 * @param {Number} [buttonCode] El botón del ratón constante IZQUIERDA, DERECHA o CENTRO
 * @return {Boolean} Verdadero si el botón se acaba de soltar
 */
p5.prototype.mouseWentUp = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_WENT_UP);
};


/**
 * Detecta si un botón del ratón se presionó durante el último ciclo.
 * Se puede usar para activar eventos una vez, comprobar en el ciclo de dibujo
 *
 * @method mouseWentDown
 * @param {Number} [buttonCode] El botón del ratón constante IZQUIEDA, DERECHA o CENTRO
 * @return {Boolean} Verdadero si el botón se acaba de presionar
 */
p5.prototype.mouseWentDown = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_WENT_DOWN);
};

/**
 * Regresa una constante para un estado del ratón dado una cadena o una constante del botón del ratón.
 *
 * @private
 * @method _clickKeyFromString
 * @param {Number|String} [buttonCode] El botón del ratón constante IZQUIERDA, DERECHA o CENTRO
 *   or string 'leftButton' (botón izquierdo), 'rightButton'(botón derecho), or 'centerButton' (botón central)
 * @return {Number} El botón del ratón constante IZQUIERDA, DERECHA o CENTRO o valor de buttonCode (código del botón)
 */
p5.prototype._clickKeyFromString = function(buttonCode) {
  if (this.CLICK_KEY[buttonCode]) {
    return this.CLICK_KEY[buttonCode];
  } else {
    return buttonCode;
  }
};

// Mapa de cadenas para constantes para estados del ratón.
p5.prototype.CLICK_KEY = {
  'leftButton': p5.prototype.LEFT,
  'rightButton': p5.prototype.RIGHT,
  'centerButton': p5.prototype.CENTER
};

/**
 * Detecta si un botón del ratón está en el estado dado durante el último ciclo.
 * El método Helper que encapsula el estado lógico del botón del ratón común; puede ser 
 * preferible para llamar mouseWentUp, etc, directamente.
 *
 * @private
 * @method _isMouseButtonInState
 * @param {Number|String} [buttonCode] El botón del ratón constante IZQUIERDA, DERECHA o CENTRO
 *   or string 'leftButton'(botón izquierdo), 'rightButton'(botón derecho), or 'centerButton' (botón central)
 * @param {Number} state
 * @return {boolean} Verdadero si el botón estaba en el estado dado
 */
p5.prototype._isMouseButtonInState = function(buttonCode, state) {
  var mouseStates = this._p5play.mouseStates;

  buttonCode = this._clickKeyFromString(buttonCode);

  if(buttonCode === undefined)
    buttonCode = this.LEFT;

  //indefinido = todavía no rastreado, comenzar rastreo
  if(mouseStates[buttonCode]===undefined)
  {
  if (this._mouseButtonIsPressed(buttonCode))
    mouseStates[buttonCode] = KEY_IS_DOWN;
  else
    mouseStates[buttonCode] = KEY_IS_UP;
  }

  return (mouseStates[buttonCode] === state);
};


/**
 * Un objeto que almacena todas las teclas útiles para fácil acceso
 * Key.tab = 9
 *
 * @private
 * @property KEY
 * @type {Object}
 */
p5.prototype.KEY = {
    'BACKSPACE': 8,
    'TAB': 9,
    'ENTER': 13,
    'SHIFT': 16,
    'CTRL': 17,
    'ALT': 18,
    'PAUSE': 19,
    'CAPS_LOCK': 20,
    'ESC': 27,
    'SPACE': 32,
    ' ': 32,
    'PAGE_UP': 33,
    'PAGE_DOWN': 34,
    'END': 35,
    'HOME': 36,
    'LEFT_ARROW': 37,
    'LEFT': 37,
    'UP_ARROW': 38,
    'UP': 38,
    'RIGHT_ARROW': 39,
    'RIGHT': 39,
    'DOWN_ARROW': 40,
    'DOWN': 40,
    'INSERT': 45,
    'DELETE': 46,
    '0': 48,
    '1': 49,
    '2': 50,
    '3': 51,
    '4': 52,
    '5': 53,
    '6': 54,
    '7': 55,
    '8': 56,
    '9': 57,
    'A': 65,
    'B': 66,
    'C': 67,
    'D': 68,
    'E': 69,
    'F': 70,
    'G': 71,
    'H': 72,
    'I': 73,
    'J': 74,
    'K': 75,
    'L': 76,
    'M': 77,
    'N': 78,
    'O': 79,
    'P': 80,
    'Q': 81,
    'R': 82,
    'S': 83,
    'T': 84,
    'U': 85,
    'V': 86,
    'W': 87,
    'X': 88,
    'Y': 89,
    'Z': 90,
    '0NUMPAD': 96,
    '1NUMPAD': 97,
    '2NUMPAD': 98,
    '3NUMPAD': 99,
    '4NUMPAD': 100,
    '5NUMPAD': 101,
    '6NUMPAD': 102,
    '7NUMPAD': 103,
    '8NUMPAD': 104,
    '9NUMPAD': 105,
    'MULTIPLY': 106,
    'PLUS': 107,
    'MINUS': 109,
    'DOT': 110,
    'SLASH1': 111,
    'F1': 112,
    'F2': 113,
    'F3': 114,
    'F4': 115,
    'F5': 116,
    'F6': 117,
    'F7': 118,
    'F8': 119,
    'F9': 120,
    'F10': 121,
    'F11': 122,
    'F12': 123,
    'EQUAL': 187,
    'COMMA': 188,
    'SLASH': 191,
    'BACKSLASH': 220
};

/**
 * Un objeto que almacena alias de teclas  obsoletas, que aún admitiremos pero
 * deberían ser esquematizadas para validar alias y generar avisos.
 *
 * @private
 * @property KEY_DEPRECATIONS
 * @type {Object}
 */
p5.prototype.KEY_DEPRECATIONS = {
  'MINUT': 'MINUS',
  'COMA': 'COMMA'
};

/**
 * Dado un alias de tecla de cadena (como se definió en la propiedad KEY arriba), buscar
 * y regresar al código de tecla númerico de JavaScript para esa tecla.  Si un alias
 * obsoleto se pasa (como se definió en la propiedad KEY_DEPRECATIONS) será 
 * esquematizado para un código de tecla válido, pero generará un aviso sobre el uso 
 * del alias obsoleto.
 *
 * @private
 * @method _keyCodeFromAlias
 * @param {!string} alias - a case-insensitive key alias 
 * @return {number|undefined} a numeric JavaScript key code, or undefined 
 *          if no key code matching the given alias is found. 
 */
p5.prototype._keyCodeFromAlias = function(alias) {
  alias = alias.toUpperCase();
  if (this.KEY_DEPRECATIONS[alias]) {
    this._warn('Key literal "' + alias + '" is deprecated and may be removed (es obsoleto y puede ser eliminado)' +
      'in a future version of p5.play. ' +
      'Please use "' + this.KEY_DEPRECATIONS[alias] + '" instead.');
    alias = this.KEY_DEPRECATIONS[alias];
  }
  return this.KEY[alias];
};

//pre draw: detect keyStates
p5.prototype.readPresses = function() {
  var keyStates = this._p5play.keyStates;
  var mouseStates = this._p5play.mouseStates;

  for (var key in keyStates) {
    if(this.keyIsDown(key)) //si está presionada
    {
      if(keyStates[key] === KEY_IS_UP)//y no estaba presionada
        keyStates[key] = KEY_WENT_DOWN;
      else
        keyStates[key] = KEY_IS_DOWN; //ahora está simplemente presionada
    }
    else //if it's up
    {
      if(keyStates[key] === KEY_IS_DOWN)//y no estaba presionada
        keyStates[key] = KEY_WENT_UP;
      else
        keyStates[key] = KEY_IS_UP; //ahora está simplemente presionada
    }
  }

  //mouse
  for (var btn in mouseStates) {

    if(this._mouseButtonIsPressed(btn)) //si está presionada
    {
      if(mouseStates[btn] === KEY_IS_UP)//y estaba presionada
        mouseStates[btn] = KEY_WENT_DOWN;
      else
        mouseStates[btn] = KEY_IS_DOWN; //ahora está simplemente presionada
    }
    else //if it's up
    {
      if(mouseStates[btn] === KEY_IS_DOWN)//y no estaba presionada
        mouseStates[btn] = KEY_WENT_UP;
      else
        mouseStates[btn] = KEY_IS_UP; //ahora está simplemente presionada
    }
  }

};

/**
* Enciende o apaga el quadTree.
* Un quadtree es una estructura de información usada para optimizar la detección de colisiones.
* Puede mejorar el rendimiento cuando hay un gran número de Sprites para 
* revisar continuamente por si se solapan.
*
* p5.play creará y actualizará un quadtree automaticaticamente, sin embargo está
* inactivo por defecto.
*
* @method useQuadTree
* @param {Boolean} utiliza Pasar a verdadero para habilitar, falso para inhabilitar
*/
p5.prototype.useQuadTree = function(use) {

  if(this.quadTree !== undefined)
  {
    if(use === undefined)
      return this.quadTree.active;
    else if(use)
      this.quadTree.active = true;
    else
      this.quadTree.active = false;
  }
  else
    return false;
};

//El quadTree real
defineLazyP5Property('quadTree', function() {
  var quadTree = new Quadtree({
    x: 0,
    y: 0,
    width: 0,
    height: 0
  }, 4);
  quadTree.active = false;
  return quadTree;
});

/*
//cuadro independente delta, no funciona en realidad
p5.prototype.deltaTime = 1;

var now = Date.now();
var then = Date.now();
var INTERVAL_60 = 0.0166666; //60 fps

function updateDelta() {
then = now;
now = Date.now();
deltaTime = ((now - then) / 1000)/INTERVAL_60; // segundos desde el último cuadro
}
*/

/**
   * Un Sprite es el principal bloque de construcción de p5.play:
   * un elemento capaz de almacenar imágenes o animaciones con un conjunto de
   * propiedas tales como posición y visibilidad.
   * Un Sprite puede tener un colisionador que define el área activa para detectar
   * collisiones o solapas/overlapping con otros sprites e interacciones del ratón.
   *
   * Para crear un Sprite, use
   * {{#crossLink "p5.play/createSprite:method"}}{{/crossLink}}.
   *
   * @class Sprite
   */

// Para detalles sobre por qué estos documentos no están en un bloque de comentario YUIDoc, ver:
//
// https://github.com/molleindustria/p5.play/pull/67
//
// @param {Number} x Initial x coordinate (coordenada inicial x)
// @param {Number} y Initial y coordinate (coordenada inicial y)
// @param {Number} width Width (ancho) del rectangulo de marcador y del
//                       colisionador hasta que se establezca una imagen o un nuevo colisionador 
// @param {Number} height Height (altura) del rectangulo de marcador y del
//                        colisionador hasta que se establezca una imagen o un nuevo colisionador 
function Sprite(pInst, _x, _y, _w, _h) {
  var pInstBind = createPInstBinder(pInst);

  var createVector = pInstBind('createVector');
  var color = pInstBind('color');
  var print = pInstBind('print');
  var push = pInstBind('push');
  var pop = pInstBind('pop');
  var colorMode = pInstBind('colorMode');
  var tint = pInstBind('tint');
  var lerpColor = pInstBind('lerpColor');
  var noStroke = pInstBind('noStroke');
  var rectMode = pInstBind('rectMode');
  var ellipseMode = pInstBind('ellipseMode');
  var imageMode = pInstBind('imageMode');
  var translate = pInstBind('translate');
  var scale = pInstBind('scale');
  var rotate = pInstBind('rotate');
  var stroke = pInstBind('stroke');
  var strokeWeight = pInstBind('strokeWeight');
  var line = pInstBind('line');
  var noFill = pInstBind('noFill');
  var fill = pInstBind('fill');
  var textAlign = pInstBind('textAlign');
  var textSize = pInstBind('textSize');
  var text = pInstBind('text');
  var rect = pInstBind('rect');
  var cos = pInstBind('cos');
  var sin = pInstBind('sin');
  var atan2 = pInstBind('atan2');

  var quadTree = pInst.quadTree;
  var camera = pInst.camera;


  // Estas son las constantes p5 a las que nos gustaría tener fácil acceso.
  var RGB = p5.prototype.RGB;
  var CENTER = p5.prototype.CENTER;
  var LEFT = p5.prototype.LEFT;
  var BOTTOM = p5.prototype.BOTTOM;

  /**
  * La posición del sprite del sprite como un vector (x,y).
  * @property position
  * @type {p5.Vector}
  */
  this.position = createVector(_x, _y);

  /**
  * La posición del sprite al comienzo de la última actualización como un vector (x,y).
  * @property previousPosition
  * @type {p5.Vector}
  */
  this.previousPosition = createVector(_x, _y);

  /*
  La posición del sprite al final de la última actualización como un vector (x,y).
  Nota: esto diferirá de la posición cada vez que se cambie la posición
  directamente por asignación.
  */
  this.newPosition = createVector(_x, _y);

  //Posición del desplazamiento en la coordenada x desde la última actualización
  this.deltaX = 0;
  this.deltaY = 0;

  /**
  * La velocidad del sprite como un vector (x,y)
  * Velocidad es rapidez desglosada en sus componentes verticales y horizontales.
  *
  * @property velocity
  * @type {p5.Vector}
  */
  this.velocity = createVector(0, 0);

  /**
  * Establece un límite de velocidad a la escala de sprite a pesar de la dirección.
  * El valor solo puede ser positivo. Si se establece en  -1, no hay límite.
  *
  * @property maxSpeed
  * @type {Number}
  * @default -1
  */
  this.maxSpeed = -1;

  /**
  * El factor fricción, reduce la velocidad del sprite.
  * La fricción debe estar cerca de 0 (ej. 0.01)
  * 0: sin fricción
  * 1: fricción completa
  *
  * @property friction
  * @type {Number}
  * @default 0
  */
  this.friction = 0;

  /**
  * El actual colisionador del Sprite.
  * Puede ser un Axis Aligned Bounding Box (un rectangulo que no rota)
  * o un colisionador circular.
  * Si se revisa el sprite por colisión, rebote, superposición o eventos del ratón, el 
  * colisionador se crea automaticamente del ancho y la altura 
  * del sprite o de la dimensión de la imagen en caso de sprites animados
  *
  * Puedes establecer un colisionador personalizado con Sprite.setCollider
  *
  * @property collider
  * @type {Object}
  */
  this.collider = undefined;

  /**
  * Objecto que contiene información sobre la más reciente colisión o sobreposición
  * Se utiliza típicamente en combinación con  las funciones 
  * Sprite.overlap o Sprite.collide.
  * Las propiedades son touching.left (tocar izquierda), touching.right (tocar derecha), touching.top (tocar parte superior),
  * touching.bottom (tocar parte inferior) y son verdadero o falso dependiendo del lado del
  * colisionador.
  *
  * @property touching
  * @type {Object}
  */
  this.touching = {};
  this.touching.left = false;
  this.touching.right = false;
  this.touching.top = false;
  this.touching.bottom = false;

  /**
  * La masa determina la velocidad de transferencia cuando los sprites rebotan
  * unos contra otros. Ver Sprite.bounce
  * Entre más alta la masa, menos será afectado el sprite por colisiones.
  *
  * @property mass
  * @type {Number}
  * @default 1
  */
  this.mass = 1;

  /**
  * Si se establece verdadero el sprite no rebotará ni será desplazado por colisiones
  * Simula una masa infinita o un objeto anclado.
  *
  * @property immovable
  * @type {Boolean}
  * @default false
  */
  this.immovable = false;

  //Coeficiente de restablecimiento - velocidad perdida en el rebote
  //0 perfectamente inelástico , 1 elástico, > 1 hiperelástico

  /**
  * Coeficiente de restablecimento. La velocidad perdida después del rebote.
  * 1: perfectamente elástico, no se perdió energía
  * 0: perfectamente inelástico, sin rebote
  * menos de 1: inelástico, esto es lo más común en la naturaleza
  * mayor de 1: hiperelástico, se aumentó la energía como una parachoques de Pinball 
  *
  * @property restitution
  * @type {Number}
  * @default 1
  */
  this.restitution = 1;

  /**
  * Rotación en grados del elemento visual (imagen o animación)
  * Nota: esta no es la dirección del movimiento, ver getDirection.
  *
  * @property rotation
  * @type {Number}
  * @default 0
  */
  Object.defineProperty(this, 'rotation', {
    enumerable: true,
    get: function() {
      return this._rotation;
    },
    set: function(value) {
      this._rotation = value;
      if (this.rotateToDirection) {
        this.setSpeed(this.getSpeed(), value);
      }
    }
  });

  /**
  * Variable de rotación interna (se expresa en grados).
  * Nota: llamadas externas acceden a esto a tráves de la propiedad de rotación anterior.
  *
  * @private
  * @property _rotation
  * @type {Number}
  * @default 0
  */
  this._rotation = 0;

  /**
  * Cambio de rotación en grados por cuadro del elemento visual (imagen o animación)
  * Nota: este no es un movimiento de dirección, ver getDirection.
  *
  * @property rotationSpeed
  * @type {Number}
  * @default 0
  */
  this.rotationSpeed = 0;


  /**
  * Automaticamente bloque la propiedad de rotación del elemento visual
  * (imagen o animación) a la dirección del movimiento del sprite y viceversa.
  *
  * @property rotateToDirection
  * @type {Boolean}
  * @default false
  */
  this.rotateToDirection = false;


  /**
  * Determina la rendering orden dentro de un grupo: un sprite con
  * baja profundidad aparecerá debajo de los que tienen mayor profundidad.
  *
  * Nota: dibujar un grupo antes que otro con drawSprites hará que
  * sus miembros aparezcan debajo del segundo, como en un lienzo de
  * dibujo p5.
  *
  * @property depth
  * @type {Number}
  * @default One more than the greatest existing sprite depth, when calling
  *          createSprite().  When calling new Sprite() directly, depth will
  *          initialize to 0 (not recommended).
  */
  this.depth = 0;

  /**
  * Determina la escala de sprite.
  * Ejemplo: 2 será el doble del tamaño nativo del visual,
  * 0.5 será la mitad. El aumento de la escala puede hacer que las imágenes sean borrosas.
  *
  * @property scale
  * @type {Number}
  * @default 1
  */
  this.scale = 1;

  var dirX = 1;
  var dirY = 1;

  /**
  * La visibilidad del sprite.
  *
  * @property visible
  * @type {Boolean}
  * @default true
  */
  this.visible = true;

  /**
  * Si se establece en verdadero sprite rastreará su estado del ratón.
  * las propiedades mouseIsPressed y mouseIsOver se actualizarán.
  * Nota: automaticamente se establece en verdadero si se establecen
  * las funciones onMouseReleased o onMousePressed.
  *
  * @property mouseActive
  * @type {Boolean}
  * @default false
  */
  this.mouseActive = false;

  /**
  * Verdadero si el ratín está en el colisionador del sprite.
  * Solo lectura.
  *
  * @property mouseIsOver
  * @type {Boolean}
  */
  this.mouseIsOver = false;

  /**
  * Verdadero si el ratón es presionado en el colisionador del sprite.
  * Solo lectura.
  *
  * @property mouseIsPressed
  * @type {Boolean}
  */
  this.mouseIsPressed = false;

  /*
  * El ancho de la imagen actual del sprite.
  * Si no se establecen imágenes o animaciones es el ancho del
  * rectángulo marcador.
  * Utilizado internamente para calcular y dibujar el sprite.
  *
  * @private
  * @property _internalWidth
  * @type {Number}
  * @default 100
  */
  this._internalWidth = _w;

  /*
  * La altura de la imagen actual del sprite.
  * Si no se establecen imágenes o animaciones es la altura del
  * rectángulo marcador.
  * Utilizado internamente para calcular y dibujar el sprite.
  *
  * @private
  * @property _internalHeight
  * @type {Number}
  * @default 100
  */
  this._internalHeight = _h;

  /*
   * @type {number}
   * @private
   * _horizontalStretch is the value to scale animation sprites in the X direction
   */
  this._horizontalStretch = 1;

  /*
   * @type {number}
   * @private
   * _verticalStretch is the value to scale animation sprites in the Y direction
   */
  this._verticalStretch = 1;

  /*
   * _internalWidth and _internalHeight are used for all p5.play
   * calculations, but width and height can be extended. For example,
   * you may want users to always get and set a scaled width:
      Object.defineProperty(this, 'width', {
        enumerable: true,
        configurable: true,
        get: function() {
          return this._internalWidth * this.scale;
        },
        set: function(value) {
          this._internalWidth = value / this.scale;
        }
      });
   */

  /**
  * Ancho de la imagen actual del sprite.
  * Si no se establecen imágenes o animaciones es el ancho del
  * rectángulo marcador.
  *
  * @property width
  * @type {Number}
  * @default 100
  */
  Object.defineProperty(this, 'width', {
    enumerable: true,
    configurable: true,
    get: function() {
      if (this._internalWidth === undefined) {
        return 100;
      } else if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
        return this._internalWidth * this._horizontalStretch;
      } else {
        return this._internalWidth;
      }
    },
    set: function(value) {
      if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
        this._horizontalStretch = value / this._internalWidth;
      } else {
        this._internalWidth = value;
      }
    }
  });

  if(_w === undefined)
    this.width = 100;
  else
    this.width = _w;

  /**
  * Altura de la imagen actual del sprite.
  * Si no se establecen imágenes o animaciones es la altura del
  * rectángulo marcador
.
  *
  * @property height
  * @type {Number}
  * @default 100
  */
  Object.defineProperty(this, 'height', {
    enumerable: true,
    configurable: true,
    get: function() {
      if (this._internalHeight === undefined) {
        return 100;
      } else if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
        return this._internalHeight * this._verticalStretch;
      } else {
        return this._internalHeight;
      }
    },
    set: function(value) {
      if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
        this._verticalStretch = value / this._internalHeight;
      } else {
        this._internalHeight = value;
      }
    }
  });

  if(_h === undefined)
    this.height = 100;
  else
    this.height = _h;

  /**
  * Ancho sin escalar del sprite
  * Si no se establecen imágenes o animaciones es el ancho del
  * rectángulo marcador.
  *
  * @property originalWidth
  * @type {Number}
  * @default 100
  */
  this.originalWidth = this._internalWidth;

  /**
  * Altura sin escala del sprite
  * Si no se establecen imágenes o animaciones es la altura del
  * rectángulo marcador.
  *
  * @property originalHeight
  * @type {Number}
  * @default 100
  */
  this.originalHeight = this._internalHeight;

  /**
   * Obtener el ancho escalado del sprite.
   *
   * @method getScaledWidth
   * @return {Number} Scaled width
   */
  this.getScaledWidth = function() {
    return this.width * this.scale;
  };

  /**
   * Obtener la altura escalada del sprite.
   *
   * @method getScaledHeight
   * @return {Number} Scaled height
   */
  this.getScaledHeight = function() {
    return this.height * this.scale;
  };

  /**
  * Verdadero si el sprite ha sido eliminado.
  *
  * @property removed
  * @type {Boolean}
  */
  this.removed = false;

  /**
  * Ciclos antes de la autoeliminación.
  * Configúralo para comenzar una cuenta regresiva, cada ciclo de dibujo la propiedad se
  * reduce por 1 unidad. En 0 llamarpa un sprite.remove()
  * Inhabilitado si se establece en -1.
  *
  * @property life
  * @type {Number}
  * @default -1
  */
  this.life = -1;

  /**
  * Si se establece como verdadero, dibuja un contorno del colisionador, la profundidad, y del centro.
  *
  * @property debug
  * @type {Boolean}
  * @default false
  */
  this.debug = false;

  /**
  * Si no establecen imágenes o animaciones este es el color del
  * rectángulo marcador
  *
  * @property shapeColor
  * @type {color}
  */
  this.shapeColor = color(127, 127, 127);

  /**
  * Agrupar los sprites a los que pertenece, incluyendo allSprites
  *
  * @property groups
  * @type {Array}
  */
  this.groups = [];

  var animations = {};

  //Etiqueta de la actual animación.
  var currentAnimation = '';

  /**
  * Referencia a la animación actual.
  *
  * @property animation
  * @type {Animation}
  */
  this.animation = undefined;

  /**
   * Colisionador barrido orientado a lo largo de la actual velocidad del vector, que se extiende para
   * cubrir las antiguas y nuevas posiciones del sprite.
   *
   * Las esquinas del colisionador barrido se extenderán más allá de la actual figura
   * barrida, pero debería ser suficente para la detección de fase amplia de los candidatos
   * a colisión.
   *
   * Ten en cuenta que este colisionador no tendrá dimensiones si el sprite fuente no tienehas no
   * velocidad.
   */
  this._sweptCollider = undefined;

  /**
  * Posición x del sprite (alias to position.x).
  *
  * @property x
  * @type {Number}
  */
  Object.defineProperty(this, 'x', {
    enumerable: true,
    get: function() {
      return this.position.x;
    },
    set: function(value) {
      this.position.x = value;
    }
  });

  /**
  * Posición y del sprite (alias to position.y).
  *
  * @property y
  * @type {Number}
  */
  Object.defineProperty(this, 'y', {
    enumerable: true,
    get: function() {
      return this.position.y;
    },
    set: function(value) {
      this.position.y = value;
    }
  });

  /**
  * Velocidad x del sprite (alias to velocity.x).
  *
  * @property velocityX
  * @type {Number}
  */
  Object.defineProperty(this, 'velocityX', {
    enumerable: true,
    get: function() {
      return this.velocity.x;
    },
    set: function(value) {
      this.velocity.x = value;
    }
  });

  /**
  * Velocidad y del sprite (alias to velocity.y).
  *
  * @property velocityY
  * @type {Number}
  */
  Object.defineProperty(this, 'velocityY', {
    enumerable: true,
    get: function() {
      return this.velocity.y;
    },
    set: function(value) {
      this.velocity.y = value;
    }
  });

  /**
  * Tiempo de vida del sprite (alias to life).
  *
  * @property lifetime
  * @type {Number}
  */
  Object.defineProperty(this, 'lifetime', {
    enumerable: true,
    get: function() {
      return this.life;
    },
    set: function(value) {
      this.life = value;
    }
  });

  /**
  * Rebote del sprite (alias to restitution).
  *
  * @property bounciness
  * @type {Number}
  */
  Object.defineProperty(this, 'bounciness', {
    enumerable: true,
    get: function() {
      return this.restitution;
    },
    set: function(value) {
      this.restitution = value;
    }
  });

  /**
  * Retrase de cuadros de la animación del sprite (alias to animation.frameDelay).
  *
  * @property frameDelay
  * @type {Number}
  */
  Object.defineProperty(this, 'frameDelay', {
    enumerable: true,
    get: function() {
      return this.animation && this.animation.frameDelay;
    },
    set: function(value) {
      if (this.animation) {
        this.animation.frameDelay = value;
      }
    }
  });

  /**
   * Si el sprite está en movimiento, utiliza el colisionador barrido. Sino utiliza el 
   * colisionador real.
   */
  this._getBroadPhaseCollider = function() {
    return (this.velocity.magSq() > 0) ? this._sweptCollider : this.collider;
  };

  /**
   * Regresa a verdadero si dos sprites curzaron caminos en el cuadro actual,
   * indicando una posible colisión.
   */
  this._doSweptCollidersOverlap = function(target) {
    var displacement = this._getBroadPhaseCollider().collide(target._getBroadPhaseCollider());
    return displacement.x !== 0 || displacement.y !== 0;
  };

  /*
   * @private
   * Mantén las propiedades de la animación en sincronización con como la animación cambia.
   */
  this._syncAnimationSizes = function(animations, currentAnimation) {
    if (pInst._fixedSpriteAnimationFrameSizes) {
      return;
    }
    if(animations[currentAnimation].frameChanged || this.width === undefined || this.height === undefined)
    {
      this._internalWidth = animations[currentAnimation].getWidth()*abs(this._getScaleX());
      this._internalHeight = animations[currentAnimation].getHeight()*abs(this._getScaleY());
    }
  };

  /**
  * Actualiza el sprite.
  * Llamdo automáticamente al inicio de un ciclo de dibujo.
  *
  * @method update
  */
  this.update = function() {

    if(!this.removed)
    {
      if (this._sweptCollider && this.velocity.magSq() > 0) {
        this._sweptCollider.updateSweptColliderFromSprite(this);
      }

      //Si hubo un cambio en algún lugar después de la última actualización
      //la posición antiguo es la última posición registrada en la actualización
      if(this.newPosition !== this.position)
        this.previousPosition = createVector(this.newPosition.x, this.newPosition.y);
      else
        this.previousPosition = createVector(this.position.x, this.position.y);

      this.velocity.x *= 1 - this.friction;
      this.velocity.y *= 1 - this.friction;

      if(this.maxSpeed !== -1)
        this.limitSpeed(this.maxSpeed);

      if(this.rotateToDirection && this.velocity.mag() > 0)
        this._rotation = this.getDirection();

      this.rotation += this.rotationSpeed;

      this.position.x += this.velocity.x;
      this.position.y += this.velocity.y;

      this.newPosition = createVector(this.position.x, this.position.y);

      this.deltaX = this.position.x - this.previousPosition.x;
      this.deltaY = this.position.y - this.previousPosition.y;

      //si hay una animación
      if(animations[currentAnimation])
      {
        //update it
        animations[currentAnimation].update();

        this._syncAnimationSizes(animations, currentAnimation);
      }

      //se crea un colisionador de manera manual setCollider o
      //cuando se revisa este sprite por colisión o superposición
      if (this.collider) {
        this.collider.updateFromSprite(this);
      }

      //acciones del ratón
      if (this.mouseActive)
      {
        //if no collider set it
          if(!this.collider)
            this.setDefaultCollider();

        this.mouseUpdate();
      }
      else
      {
        if (typeof(this.onMouseOver) === 'function' ||
            typeof(this.onMouseOut) === 'function' ||
            typeof(this.onMousePressed) === 'function' ||
            typeof(this.onMouseReleased) === 'function')
        {
          //if a mouse function is set
          //it's implied we want to have it mouse active so
          //we do this automatically
          this.mouseActive = true;

          //if no collider set it
          if(!this.collider)
            this.setDefaultCollider();

          this.mouseUpdate();
        }
      }

      //self destruction countdown
      if (this.life>0)
        this.life--;
      if (this.life === 0)
        this.remove();
    }
  };//fin de la actualización

  /**
   * Crea un colisionador por defecto que coincide con el tamaño del
   * rectángulo marcador o el cuadro deliminante de la imagen.
   *
   * @method setDefaultCollider
   */
  this.setDefaultCollider = function() {
    if(animations[currentAnimation] && animations[currentAnimation].getWidth() === 1 && animations[currentAnimation].getHeight() === 1) {
      //animation is still loading
      return;
    }
    this.setCollider('rectangle');
  };

  /**
   * Actualiza el sprite de los estados del ratón y desencadena eventos del ratón:
   * onMouseOver, onMouseOut, onMousePressed, onMouseReleased
   *
   * @method mouseUpdate
   */
  this.mouseUpdate = function() {
    var mouseWasOver = this.mouseIsOver;
    var mouseWasPressed = this.mouseIsPressed;

    this.mouseIsOver = false;
    this.mouseIsPressed = false;

    //rollover
    if(this.collider) {
      var mousePosition;

      if(camera.active)
        mousePosition = createVector(camera.mouseX, camera.mouseY);
      else
        mousePosition = createVector(pInst.mouseX, pInst.mouseY);

      this.mouseIsOver = this.collider.overlap(new p5.PointCollider(mousePosition));

      //global p5 var
      if(this.mouseIsOver && (pInst.mouseIsPressed || pInst.touchIsDown))
        this.mouseIsPressed = true;

      //event change - call functions
      if(!mouseWasOver && this.mouseIsOver && this.onMouseOver !== undefined)
        if(typeof(this.onMouseOver) === 'function')
          this.onMouseOver.call(this, this);
        else
          print('Warning: onMouseOver should be a function');

      if(mouseWasOver && !this.mouseIsOver && this.onMouseOut !== undefined)
        if(typeof(this.onMouseOut) === 'function')
          this.onMouseOut.call(this, this);
        else
          print('Warning: onMouseOut should be a function');

      if(!mouseWasPressed && this.mouseIsPressed && this.onMousePressed !== undefined)
        if(typeof(this.onMousePressed) === 'function')
          this.onMousePressed.call(this, this);
        else
          print('Advertencia: onMousePressed debería ser una función ');

      if(mouseWasPressed && !pInst.mouseIsPressed && !this.mouseIsPressed && this.onMouseReleased !== undefined)
        if(typeof(this.onMouseReleased) === 'function')
          this.onMouseReleased.call(this, this);
        else
          print('Advertencia: onMouseReleased debería ser una función');

    }
  };

  /**
  * Establece un colisionador para el sprite.
  *
  * En p5.play un colisionador es un círculo o rectángulo invisible
  * que puede tener cualquier tamaño o posición respecto al sprite y que
  * se usará para detectar colisiones y superposiciones con otros sprites,
  * o el cursos del ratón.
  *
  * Si se revisa el sprite por colisión, rebote, sobreposición o eventos del ratón
  * un rectángulo colisionador se creará automáticamente del ancho y alto
  * que pasaron los parámetros en la creación del sprite o de las dimensiones
  * de la imagen en caso de sprites animados.
  *
  * Amenudo la caja delimitante de la imagen no es apropiada como área activa para
  * detectar colisiones así que puedes establecer un sprite circular o rectángular con
  * dimensiones diferentes y desplazarlo desde el centro del sprite.
  *
  * Hay muchas maneras de llamar a este método.  El primero argumento determina el
  * el tipo de colisionador que estás creando, que a su vez cambia el resto de los
  * argumentos.  Los tipos de colisionador válidos son:
  *
  * * `point`: un colisionador de puntos sin dimensiones, solo una posición.
  *
  *   `setCollider("point"[, offsetX, offsetY])`
  *
  * * `circle`: un colisionador circular con un radio establecido.
  *
  *   `setCollider("circle"[, offsetX, offsetY[, radius])`
  *
  * * `rectangle`: un alias para` aabb`, a continuación.
  *
  * * `aabb` - Un cuadro delimitador alineado con el eje: tiene ancho y alto pero no rotación.
  *
  *   `setCollider("aabb"[, offsetX, offsetY[, width, height]])`
  *
  * * `obb` - Un cuadro delimitador orientado - tiene ancho, alto y rotación.
  *
  *   `setCollider("obb"[, offsetX, offsetY[, width, height[, rotation]]])`
  *
  *
  * @method setCollider
  * @param {String} tipo Uno de "point", "circle", "rectangle", "aabb" o "obb"
  * @param {Number} [offsetX] Posición del colisionador x desde el centro del sprite
  * @param {Number} [offsetY] Posición y colisionador desde el centro del sprite
  * @param {Number} [width] Ancho o radio del colisionador
  * @param {Number} [height] Altura del colisionador
  * @param {Number} [rotation] Rotación del colisionador en grados
  * @throws {TypeError} si se le dan parámetros no válidos.
  */
  this.setCollider = function(type, offsetX, offsetY, width, height, rotation) {
    var _type = type ? type.toLowerCase() : '';
    if (_type === 'rectangle') {
      // Asigne 'rectángulo' a AABB. Cambie esto si quiere que sea OBB por defecto.
      _type = 'obb';
    }

    // Verifique los argumentos correctos, proporcione un mensaje de uso sensible al contexto si es incorrecto.
    if (!(_type === 'point' || _type === 'circle' || _type === 'obb' || _type === 'aabb')) {
      throw new TypeError('setCollider expects the first argument to be one of "point", "circle", "rectangle", "aabb" or "obb"');
    } else if (_type === 'point' && !(arguments.length === 1 || arguments.length === 3)) {
      throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY])');
    } else if (_type === 'circle' && !(arguments.length === 1 || arguments.length === 3 || arguments.length === 4)) {
      throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY[, radius]])');
    } else if (_type === 'aabb' && !(arguments.length === 1 || arguments.length === 3 || arguments.length === 5)) {
      throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY[, width, height]])');
    } else if (_type === 'obb' && !(arguments.length === 1 || arguments.length === 3 || arguments.length === 5 || arguments.length === 6)) {
      throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY[, width, height[, rotation]]])');
    }

    //var center = this.position;
    var offset = createVector(offsetX, offsetY);

    if (_type === 'point') {
      this.collider = p5.PointCollider.createFromSprite(this, offset);
    } else if (_type === 'circle') {
      this.collider = p5.CircleCollider.createFromSprite(this, offset, width);
    } else if (_type === 'aabb') {
      this.collider = p5.AxisAlignedBoundingBoxCollider.createFromSprite(this, offset, width, height);
    } else if (_type === 'obb') {
      this.collider = p5.OrientedBoundingBoxCollider.createFromSprite(this, offset, width, height, radians(rotation));
    }

    this._sweptCollider = new p5.OrientedBoundingBoxCollider();

    // Inhabilitado para Code.org, ya que el perf parece mejor sin el quadtree:
    // quadTree.insert(this);
  };

  /**
  * Establece el reflejo horizontal del sprite.
  * Si 1 de las imágenes se muestra normalmente
  * Si -1 de las imágenes se voltean horizontalmente
  * Si ningún argumento regresa al reflejo actual x
  *
  * @method mirrorX
  * @param {Number} dir 1 o -1
  * @return {Number} Reflejo actual si no se especifica ningún parámetro
  */
  this.mirrorX = function(dir) {
    if(dir === 1 || dir === -1)
      dirX = dir;
    else
      return dirX;
  };

  /**
  * Establece el relejo vertial del sprite.
  * Si 1 de las imágenes se muestran normalmente
  * Si -1 de las imágenes se voltean verticalmente
  * Si ningún argumento regresa al reflejo actual y
  *
  * @method mirrorY
  * @param {Number} dir 1 o -1
  * @return {Number} Reflejo actual si no se especifica ningún parámetro
  */
  this.mirrorY = function(dir) {
    if(dir === 1 || dir === -1)
      dirY = dir;
    else
      return dirY;
  };

  /*
   * Regresa el valor del sprite debería en la escala de la dirección x.
   * Utilizado para calcular sintetizaciones y colisiones.
   * Cuando se establece  _fixedSpriteAnimationFrameSizes , el valor de la escala debería
   * incluir el estiramiento horizontal para animaciones.
   * @private
   */
  this._getScaleX = function()
  {
    if (pInst._fixedSpriteAnimationFrameSizes) {
      return this.scale * this._horizontalStretch;
    }
    return this.scale;
  };

  /*
   * Regresa el valor del sprite debería en la escala de la dirección y.
   * Utilizado para calcular sintetizaciones y colisiones.
   * Cuando se establece _fixedSpriteAnimationFrameSizes , el valor de la escala debería
   * incluir el estiramiento vertical para animaciones.
   * @private
   */
  this._getScaleY = function()
  {
    if (pInst._fixedSpriteAnimationFrameSizes) {
      return this.scale * this._verticalStretch;
    }
    return this.scale;
  };

  /**
   * Dirige la posición, escala y la rotación del sprite
   * Llamado automáticamente, no debería ser invalidado
   * @private
   * @final
   * @method display - mostrar
   */
  this.display = function()
  {
    if (this.visible && !this.removed)
    {
      push();
      colorMode(RGB);

      noStroke();
      rectMode(CENTER);
      ellipseMode(CENTER);
      imageMode(CENTER);

      translate(this.position.x, this.position.y);
      if (pInst._angleMode === pInst.RADIANS) {
        rotate(radians(this.rotation));
      } else {
        rotate(this.rotation);
      }
      scale(this._getScaleX()*dirX, this._getScaleY()*dirY);
      this.draw();
      //dibujar información de depuración
      pop();


      if(this.debug)
      {
        push();
        //dibuja el punto de anclaje
        stroke(0, 255, 0);
        strokeWeight(1);
        line(this.position.x-10, this.position.y, this.position.x+10, this.position.y);
        line(this.position.x, this.position.y-10, this.position.x, this.position.y+10);
        noFill();

        //número de profundidad
        noStroke();
        fill(0, 255, 0);
        textAlign(LEFT, BOTTOM);
        textSize(16);
        text(this.depth+'', this.position.x+4, this.position.y-2);

        noFill();
        stroke(0, 255, 0);

        // Dibuja la figura de la colisión
        if (this.collider === undefined) {
          this.setDefaultCollider();
        }
        if(this.collider) {
          this.collider.draw(pInst);
        }
        pop();
      }

    }
  };


  /**
  * Dirige el visual del sprite.
  * Puede ser invalidado con una función de dibujo personalizada.
  * El punto 0,0 será el centro del sprite.
  * Ejemplo:
  * sprite.draw = function() { ellipse(0,0,10,10) }
  * Mostrará el sprite como un círculo.
  *
  * @method draw - dibujar
  */
  this.draw = function()
  {
    if(currentAnimation !== '' && animations)
    {
      if(animations[currentAnimation]) {
        if(this.tint) {
          push();
          tint(this.tint);
        }
        animations[currentAnimation].draw(0, 0, 0);
        if(this.tint) {
          pop();
        }
      }
    }
    else
    {
      var fillColor = this.shapeColor;
      if (this.tint) {
        fillColor = lerpColor(color(fillColor), color(this.tint), 0.5);
      }
      noStroke();
      fill(fillColor);
      rect(0, 0, this._internalWidth, this._internalHeight);
    }
  };

  /**
   * Elimina el sprite del esquema.
   * El sprite eliminado no se va a dibujar o actualizar más.
   *
   * @method remove - eliminar
   */
  this.remove = function() {
    this.removed = true;

    quadTree.removeObject(this);

    //cuando se elimina de la "escene" también se eliminan todas las referencias en todos los grupos
    while (this.groups.length > 0) {
      this.groups[0].remove(this);
    }
  };

  /**
   * Alias para <a href='#method-remove'>remove()</a>
   *
   * @method destroy
   */
  this.destroy = this.remove;

  /**
  * Establece la velocidad del vector.
  *
  * @method setVelocity
  * @param {Number} x Componente X
  * @param {Number} y Componente Y
  */
  this.setVelocity = function(x, y) {
    this.velocity.x = x;
    this.velocity.y = y;
  };

  /**
  * Calcula la escala de velocidad.
  *
  * @method getSpeed
  * @return {Number} Velocidad escalar
  */
  this.getSpeed = function() {
    return this.velocity.mag();
  };

  /**
  * Calcula la dirección del movimiento en grados.
  *
  * @method getDirection
  * @return {Number} Ángulo en grados
  */
  this.getDirection = function() {

    var direction = atan2(this.velocity.y, this.velocity.x);

    if(isNaN(direction))
      direction = 0;

    // A diferencia de Math.atan2, el método atan2 anterior regresará los grados si
    // el actual p5 angleMode es DEGREES, y radianes si el p5 angleMode es
    // RADIANS.  Este método debería siempre regresar grados (por ahora).
    // ver https://github.com/molleindustria/p5.play/issues/94
    if (pInst._angleMode === pInst.RADIANS) {
      direction = degrees(direction);
    }

    return direction;
  };

  /**
  * Agrega el sprite a un grupo existente
  *
  * @method addToGroup
  * @param {Object} group - grupo
  */
  this.addToGroup = function(group) {
    if(group instanceof Array)
      group.add(this);
    else
      print('error addToGroup: '+group+' no es un grupo');
  };

  /**
  * Limita la escala de velocidad.
  *
  * @method limitSpeed
  * @param {Number} max Velocidad máxima: número positivo
  */
  this.limitSpeed = function(max) {

    //actualiza la velocidad lineal
    var speed = this.getSpeed();

    if(abs(speed)>max)
    {
      //encontrar un factor de reducción
      var k = max/abs(speed);
      this.velocity.x *= k;
      this.velocity.y *= k;
    }
  };

  /**
  * Establece la velocidad y la dirección del sprite.
  * La acción reescribe la velocidad actual.
  * Si no se provee la dirección, se mantiene la dirección actual.
  * Si no se provee la dirección y no hay velocidad actual, la rotación 
  * del ángulo actual se utiliza para la dirección.
  *
  * @method setSpeed
  * @param {Number}  speed - velocidad Velocidad escalar
  * @param {Number}  [angle] Dirección en grados
  */
  this.setSpeed = function(speed, angle) {
    var a;
    if (typeof angle === 'undefined') {
      if (this.velocity.x !== 0 || this.velocity.y !== 0) {
        a = pInst.atan2(this.velocity.y, this.velocity.x);
      } else {
        if (pInst._angleMode === pInst.RADIANS) {
          a = radians(this._rotation);
        } else {
          a = this._rotation;
        }
      }
    } else {
      if (pInst._angleMode === pInst.RADIANS) {
        a = radians(angle);
      } else {
        a = angle;
      }
    }
    this.velocity.x = cos(a)*speed;
    this.velocity.y = sin(a)*speed;
  };

  /**
   * Alias para <a href='#method-setSpeed'>setSpeed()</a>
   *
   * @method setSpeedAndDirection
   * @param {Number}  speed - velocidad Velocidad escalar
   * @param {Number}  [angle] Dirección en grados
   */
  this.setSpeedAndDirection = this.setSpeed;

  /**
  * Alias para <a href='Animation.html#method-changeFrame'>animation.changeFrame()</a>
  *
  * @method setFrame
  * @param {Number} frame - cuadro. Número de cuadro (comienza desde 0).
  */
  this.setFrame = function(f) {
    if (this.animation) {
      this.animation.changeFrame(f);
    }
  };

  /**
  * Alias para <a href='Animation.html#method-nextFrame'>animation.nextFrame()</a>
  *
  * @method nextFrame
  */
  this.nextFrame = function() {
    if (this.animation) {
      this.animation.nextFrame();
    }
  };

  /**
  * Alias para <a href='Animation.html#method-previousFrame'>animation.previousFrame()</a>
  *
  * @method previousFrame
  */
  this.previousFrame = function() {
    if (this.animation) {
      this.animation.previousFrame();
    }
  };

  /**
  * Alias para <a href='Animation.html#method-stop'>animation.stop()</a>
  *
  * @method pause - pausa
  */
  this.pause = function() {
    if (this.animation) {
      this.animation.stop();
    }
  };

  /**
   * Alias para <a href='Animation.html#method-play'>animation.play()</a> envoltorio para acceder
   *
   * Reproduce/reanuda la animación actual del sprite.
   * Si la animación se está reproduciendo esto no tiene efecto.
   * Si la animación se detuvo en el último cuadro, esto hará que comience de nuevo
   * desde el principio.
   *
   * @method play
   */
  this.play = function() {
    if (!this.animation) {
      return;
    }
    // Normalmente esto solo establece la indicación 'playing'  sin cambiar el cuadro de la 
    // animación, que causará  que la animación continue en la próxima update().
    // Si la animación no es un bucle y se detiene en el último cuadro
    // también regresamos la animación al principio.
    if (!this.animation.looping && !this.animation.playing && this.animation.getFrame() === this.animation.images.length - 1) {
      this.animation.rewind();
    }
    this.animation.play();
  };

  /**
   * Envoltorio para acceder <a href='Animation.html#prop-frameChanged'>animation.frameChanged</a>
   *
   * @method frameDidChange
   * @return {Boolean} verdadero si el cuadro de la animación ha cambiado
   */
  this.frameDidChange = function() {
    return this.animation ? this.animation.frameChanged : false;
  };

  /**
  * Girar el sprite a una posición específica 
  *
  * @method setFrame
  * @param {Number} x Coordenada horizontal para apuntar
  * @param {Number} y Coordenada vertical para apuntar
  */
  this.pointTo = function(x, y) {
    var yDelta = y - this.position.y;
    var xDelta = x - this.position.x;
    if (!isNaN(xDelta) && !isNaN(yDelta) && (xDelta !== 0 || yDelta !== 0)) {
      var radiansAngle = Math.atan2(yDelta, xDelta);
      this.rotation = 360 * radiansAngle / (2 * Math.PI);
    }
  };

  /**
  * Empuja el sprite a una dirección definida por un ángulo.
  * La fuerza se agrega a la velocidad actual.
  *
  * @method addSpeed
  * @param {Number}  speed - velocidad Velocidad escalar para agregar 
  * @param {Number}  angle - ángulo Dirección en grados
  */
  this.addSpeed = function(speed, angle) {
    var a;
    if (pInst._angleMode === pInst.RADIANS) {
      a = radians(angle);
    } else {
      a = angle;
    }
    this.velocity.x += cos(a) * speed;
    this.velocity.y += sin(a) * speed;
  };

  /**
  * Empuja el sprite hacia un punto.
  * La  fuerza se agrega a la velocidad actual.
  *
  * @method attractionPoint
  * @param {Number}  magnitud velocidad Escalar para sumar
  * @param {Number}  pointX Dirección coordenada x
  * @param {Number}  pointY Dirección coordenada y
  */
  this.attractionPoint = function(magnitude, pointX, pointY) {
    var angle = atan2(pointY-this.position.y, pointX-this.position.x);
    this.velocity.x += cos(angle) * magnitude;
    this.velocity.y += sin(angle) * magnitude;
  };


  /**
  * Agrega una imagen al sprite.
  * Una imagen se considerara como una animación de un cuadro.
  * La imagen debe precargarse en la función preload() usando p5 loadImage.
  * Las animaciones requieren una etiqueta de identificación (cadena) para cambiarlas.
  * La imagen se almacena en el sprite pero no necesariamente se muestra
  * hasta que se llama Sprite.changeAnimation(label) .
  *
  * Usages:
  * - sprite.addImage(label, image);
  * - sprite.addImage(image);
  *
  * Si solo se pasa una imagen no se especifica ninguna etiqueta
  *
  * @method addImage
  * @param {String|p5.Image} label Etiqueta o imagen
  * @param {p5.Image} [img] Image - imagen
  */
  this.addImage = function()
  {
    if(typeof arguments[0] === 'string' && arguments[1] instanceof p5.Image)
      this.addAnimation(arguments[0], arguments[1]);
    else if(arguments[0] instanceof p5.Image)
      this.addAnimation('normal', arguments[0]);
    else
      throw('addImage error: los usos permitidos son <image> o <label>, <image>');
  };

  /**
  * Agrega una animación al sprite.
  * La animación debe precargarse en la función preload() 
  * usando loadAnimation.
  * Las animaciones requieren una etiqueta de identificación (cadena) para cambiarlas.
  * Las animaciones se almacenan en el sprite pero no necesariamente se muestran
  * hasta que se llama Sprite.changeAnimation(label) .
  *
  * Uso:
  * - sprite.addAnimation(label, animation);
  *
  * Usos alternativos. Consulte Animación para obtener más información sobre las secuencias de archivos:
  * - sprite.addAnimation(label, firstFrame, lastFrame);
  * - sprite.addAnimation(label, frame1, frame2, frame3...);
  *
  * @method addAnimation
  * @param {String} label - etiqueta. Identificador de animación
  * @param {Animation} animation - animación. La animación precargada
  */
  this.addAnimation = function(label)
  {
    var anim;

    if(typeof label !== 'string')
    {
      print('Error de Sprite.addAnimation: el primer argumento debe ser una etiqueta (String)');
      return -1;
    }
    else if(arguments.length < 2)
    {
      print('addAnimation error: debe especificar una etiqueta y n imágenes del cuadro');
      return -1;
    }
    else if(arguments[1] instanceof Animation)
    {

      var sourceAnimation = arguments[1];

      var newAnimation = sourceAnimation.clone();

      animations[label] = newAnimation;

      if(currentAnimation === '')
      {
        currentAnimation = label;
        this.animation = newAnimation;
      }

      newAnimation.isSpriteAnimation = true;

      this._internalWidth = newAnimation.getWidth()*abs(this._getScaleX());
      this._internalHeight = newAnimation.getHeight()*abs(this._getScaleY());

      return newAnimation;
    }
    else
    {
      var animFrames = [];
      for(var i=1; i<arguments.length; i++)
        animFrames.push(arguments[i]);

      anim = construct(pInst.Animation, animFrames);
      animations[label] = anim;

      if(currentAnimation === '')
      {
        currentAnimation = label;
        this.animation = anim;
      }
      anim.isSpriteAnimation = true;

      this._internalWidth = anim.getWidth()*abs(this._getScaleX());
      this._internalHeight = anim.getHeight()*abs(this._getScaleY());

      return anim;
    }

  };

  /**
  * Cambia la imagen/animación mostrada.
  * Equivalente a changeAnimation
  *
  * @method changeImage
  * @param {String} label Identificador de imagen / animación
  */
  this.changeImage = function(label) {
    this.changeAnimation(label);
  };

   /**
  * Regresa la etiqueta de la animación actual
  *
  * @method getAnimationLabel
  * @return {String} label Identificador de imagen/animación
  */
  this.getAnimationLabel = function() {
    return currentAnimation;
  };

  /**
  * Cambia la animación mostrada.
  * Ver animación para más control en la secuencia.
  *
  * @method changeAnimation
  * @param {String} label Identificador de animación
  */
  this.changeAnimation = function(label) {
    if(!animations[label])
      print('changeAnimation error: no hay animación etiquetada '+label);
    else
    {
      currentAnimation = label;
      this.animation = animations[label];
    }
  };

  /**
  * Establece la animación de una lista en _predefinedSpriteAnimations.
  *
  * @method setAnimation
  * @private
  * @param {String} label Identificador de animación
  */
  this.setAnimation = function(animationName) {
    if (animationName === this.getAnimationLabel()) {
      return;
    }

    var animation = pInst._predefinedSpriteAnimations &&
        pInst._predefinedSpriteAnimations[animationName];
    if (typeof animation === 'undefined') {
      throw new Error('No se pudo encontrar una animación con el nombre "' + animationName +
          '".  Asegúrate de que la animación exista.');
    }
    this.addAnimation(animationName, animation);
    this.changeAnimation(animationName);
    if (pInst._pauseSpriteAnimationsByDefault) {
      this.pause();
    }
  };

  /**
  * Verifica si el punto dado corresponde a un pixel transparente
  * en la imagen actual del sprite. Puede usarse para verificar un punto de colisión
  * contra solo la parte visible del sprite.
  *
  * @method overlapPixel
  * @param {Number} pointX coordenada x del punto a comprobar
  * @param {Number} pointY coordenada y del punto a comprobar
  * @return {Boolean} resultado Verdadero si no es transparente
  */
  this.overlapPixel = function(pointX, pointY) {
    var point = createVector(pointX, pointY);

    var img = this.animation.getFrameImage();

    //convertir un punto a una posición relativa img
    point.x -= this.position.x-img.width/2;
    point.y -= this.position.y-img.height/2;

    //fuera de la imagen por completo
    if(point.x<0 || point.x>img.width || point.y<0 || point.y>img.height)
      return false;
    else if(this.rotation === 0 && this.scale === 1)
    {
      //verdadero si tiene opacidad completa
      var values = img.get(point.x, point.y);
      return values[3] === 255;
    }
    else
    {
      print('Error: la superposición de píxeles aún no funciona con sprites escalados o rotados');
      //impresión fuera de pantalla que se implementará bleurch
      return false;
    }
  };

  /**
  * Verifica si el punto dado está dentro del colisionador del sprite.
  *
  * @method overlapPoint
  * @param {Number} pointX coordenada x del punto a comprobar
  * @param {Number} pointY coordenada y del punto a comprobar
  * @return {Boolean} Resultado verdadera si dentro
  */
  this.overlapPoint = function(pointX, pointY) {
    if(!this.collider)
      this.setDefaultCollider();

    if(this.collider) {
      var point = new p5.PointCollider(new p5.Vector(pointX, pointY));
      return this.collider.overlap(point);
    }
    return false;
  };


  /**
  * Verifica si el sprite está sobrepuesto a otro sprite o a un grupo.
  * La verificación se lleva a cabo usando los colisionadores. Si los colisionadores no está establecidos 
  * se crearán automáticamente de la caja delimitante de la imagen/animación.
  *
  * Una función de callback puede especificarse para llevar a cabo operaciones adicionales
  * cuando ocurre una sopreposición.
  * Si el blanco es un grupo la función se llamará por cada uno de los
  * sprites sobrepuestos. El parámetro de la función son respectivamente el
  * sprite actual y el sprite colisionado.
  *
  * @example - ejemplo 
  *     sprite.overlap(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method overlap - superposición
  * @param {Object} target Sprite o grupo para comparar con el actual
  * @param {Function} [callback] La función que se llamará si la superposición es positiva
  * @return {Boolean} Verdadero si se superpone
  */
  this.overlap = function(target, callback) {
    return this._collideWith('overlap', target, callback);
  };

  /**
   * Alias for <a href='#method-overlap'>overlap()</a>, excepto sin un
   * parámetro de callback.
   * La verificación se lleva a cabo utilizando los colisionadores. Si los colisionadores no están establecidos are not set
   * se crearán automáticamente de la caja delimitante de la imagen/animación.
   *
   * Regresa si este sprite se sobrepone o no a otro sprite
   * o a un grupo. Modifica el objeto de propiedad táctil del sprite.
   *
   * @method isTouching
   * @param {Object} target Sprite o grupo para comparar con el actual
   * @return {Boolean} Verdadero si se superpone
   */
  this.isTouching = this.overlap;

  /**
  * Verifica si el sprite se sobrepone a otro sprite o a un grupo.
  * Si es positivo a la sobreposición el sprite rebotará con el(los) blanco(s)
  * tratados como inamovible con un coeficiente de restitución de cero.
  *
  * La verificación se lleva a cabo utilizando colisionadores. Si los colisionadores no están establecidos
  * serán creados automáticamente de la caja delimitante de la imagen/animación.
  *
  * Una función de callback puede ser especificada para llevar a cabo operaciones adicionales
  * cuando ocurra una colisión.
  * Si el blanco es un grupo la función  será llamada por cada uno de los
  * sprites colisionados. El parámetro de la función son respectivamente el
  * sprite actual y el sprite colisionado.
  *
  * @example - ejemplo 
  *     sprite.collide(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method collide - colisiona 
  * @param {Object} target Sprite o grupo para comparar con el actual
  * @param {Function} [callback] La función que se llamará si la superposición es positiva
  * @return {Boolean} Verdadero si se superpone
  */
  this.collide = function(target, callback) {
    return this._collideWith('collide', target, callback);
  };

  /**
  * Verifica si el sprite se sobrepone a otro sprite o a un grupo.
  * Si es positivo a la sobreposición el sprite desplazará
  * al colisionado a la posición más cerca que no se sobreponga.
  *
  * La verificación se lleva a cabo utilizando colisionadores. Si los colisionadores no están establecidos
  * serán creados automáticamente de la caja delimitante de la imagen/animación.
  *
  * Una función de callback puede ser especificada para llevar a cabo operaciones adicionales
  * cuando ocurra una colisión.
  * Si el blanco es un grupo la función será llamada por cada uno de los
  * sprites colisionados. El parámetro de la función son respectivamente el
  * sprite actual y el sprite colisionado.
  *
  * @example - ejemplo
  *     sprite.displace(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method displace - desplazar
  * @param {Object} target Sprite o grupo para comparar con el actual
  * @param {Function} [callback] La función que se llamará si la superposición es positiva
  * @return {Boolean} Verdadero si se superpone
  */
  this.displace = function(target, callback) {
    return this._collideWith('displace', target, callback);
  };

  /**
  * Verifica si el sprite se sobrepone a otro sprite o a un grupo.
  * Si es positivo a la sobreposición los sprites reborarán afectando la 
  * trayectoria del otro dependiendo de su .velocity (velocidad), .mass (masa) and .restitution (restitución)
  *
  * La verificación se lleva a cabo utilizando colisionadores. Si los colisionadores no están establecidos
  * serán creados automáticamente de la caja delimitante de la imagen/animación.
  *
  * Una función de callback puede ser especificada para llevar a cabo operaciones adicionales
  * cuando ocurra una colisión.
  * Si el blanco es un grupo la función será llamada por cada uno de los
  * sprites colisionados. El parámetro de la función son respectivamente el
  * sprite actual y el sprite colisionado.
  *
  * @example - ejemplo 
  *     sprite.bounce(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method bounce - rebotar 
  * @param {Object} target Sprite o grupo para comparar con el actual
  * @param {Function} [callback] La función que se llamará si la superposición es positiva
  * @return {Boolean} Verdadero si se superpone
  */
  this.bounce = function(target, callback) {
    return this._collideWith('bounce', target, callback);
  };

  /**
  * Verifica si el sprite se sobrepone a otro sprite o a un grupo.
  * Si es positivo a la sobreposición los sprites reborarán con el(los) blanco(s) 
  * tratados como inamovibles.
  *
  * La verificación se lleva a cabo utilizando colisionadores. Si los colisionadores no están establecidos
  * serán creados automáticamente de la caja delimitante de la imagen/animación.
  *
  * Una función de callback puede ser especificada para llevar a cabo operaciones adicionales
  * cuando ocurra una colisión.
  * Si el blanco es un grupo la función será llamada por cada uno de los
  * sprites colisionados. El parámetro de la función son respectivamente el
  * sprite actual y el sprite colisionado.
  *
  * @example - ejemplo 
  *     sprite.bounceOff(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method bounceOff - rebotar en 
  * @param {Object} target Sprite o grupo para comparar con el actual
  * @param {Function} [callback] La función que se llamará si la superposición es positiva
  * @return {Boolean} Verdadero si se superpone
  */
  this.bounceOff = function(target, callback) {
    return this._collideWith('bounceOff', target, callback);
  };

  /**
   * Función de detección de colisión interna. No usar directamente.
   *
   * Se hace cargo de la colisión con sprites individuales o con grupos, usando 
   * quadtree para optimizar este último.
   *
   * @method _collideWith
   * @private - privado 
   * @param {string} type - 'overlap', 'isTouching', 'displace', 'collide',
   *   'bounce' o 'bounceOff'
   * @param {Sprite|Group} target - objetivo
   * @param {function} callback - Si se produjo una colisión (ignorada para 'isTouching')
   * @return {boolean} verdadero si ocurrió una colisión
   */
  this._collideWith = function(type, target, callback) {
    this.touching.left = false;
    this.touching.right = false;
    this.touching.top = false;
    this.touching.bottom = false;

    if (this.removed) {
      return false;
    }

    var others = [];

    if (target instanceof Sprite) {
      others.push(target);
    } else if (target instanceof Array) {
      if (pInst.quadTree !== undefined && pInst.quadTree.active) {
        others = pInst.quadTree.retrieveFromGroup(this, target);
      }

      // Si el quadtree está deshabilitado -o- no hay sprites en este grupo en el
      // quadtree todavía (porque sus colliders predeterminados no se han creado)
      // deberíamos comprobarlos todos.
      if (others.length === 0) {
        others = target;
      }
    } else {
      throw('Error: la superposición solo se puede verificar entre sprites o grupos');
    }

    var result = false;
    for(var i = 0; i < others.length; i++) {
      result = this._collideWithOne(type, others[i], callback) || result;
    }
    return result;
  };

  /**
   * Método Helper de colisiones para colisionar este sprite con otro sprite.
   *
   * Tiene el efecto secundario de establecer propiedades de setting this.touching en TRUE (Verdadero) si ocurren
   * colisiones.
   *
   * @method _collideWithOne
   * @private - privado
   * @param {string} type - 'overlap', 'isTouching', 'displace', 'collide',
   *   'bounce' o 'bounceOff'
   * @param {Sprite} other - otro
   * @param {function} callback - Si se produjo una colisión (ignorada para 'isTouching')
   * @return {boolean} verdadero si ocurrió una colisión
   */
  this._collideWithOne = function(type, other, callback) {
    // Nunca colisionar con uno mismo
    if (other === this || other.removed) {
      return false;
    }

    if (this.collider === undefined) {
      this.setDefaultCollider();
    }

    if (other.collider === undefined) {
      other.setDefaultCollider();
    }

    if (!this.collider || !other.collider) {
      // Somos incapaces de crear un colisionador para unos de los sprites.
      // Esto usualmente significa que su animación todavía no está disponible; lo estará pronto.
      // No colisionar por ahora.
      return false;
    }

    // En realidad calcula la sobreposición de dos colisionadores 
    var displacement = this._findDisplacement(other);
    if (displacement.x === 0 && displacement.y === 0) {
      // Estos sprites no se están sobreponiendo.
      return false;
    }

    if (displacement.x > 0)
      this.touching.left = true;
    if (displacement.x < 0)
      this.touching.right = true;
    if (displacement.y < 0)
      this.touching.bottom = true;
    if (displacement.y > 0)
      this.touching.top = true;

    // Aplica el desplazamiento fuera de la colisión
    if (type === 'displace' && !other.immovable) {
      other.position.sub(displacement);
    } else if ((type === 'collide' || type === 'bounce' || type === 'bounceOff') && !this.immovable) {
      this.position.add(displacement);
      this.previousPosition = createVector(this.position.x, this.position.y);
      this.newPosition = createVector(this.position.x, this.position.y);
      this.collider.updateFromSprite(this);
    }

    // Crea comportamientos especiales para ciertos tipos de colisiones anulando
    // temporalmente el tipo y las propiedades del sprite.
    // Ver otro bloque cerca del final de este método que los pone de regreso.
    var originalType = type;
    var originalThisImmovable = this.immovable;
    var originalOtherImmovable = other.immovable;
    var originalOtherRestitution = other.restitution;
    if (originalType === 'collide') {
      type = 'bounce';
      other.immovable = true;
      other.restitution = 0;
    } else if (originalType === 'bounceOff') {
      type = 'bounce';
      other.immovable = true;
    }

    // Si esta es una colisión de 'bounce' (rebote), determina nuevas velocidades para cada sprite
    if (type === 'bounce') {
      // Solo nos preocupan las velocidades paralelas a la normal de colisión,
      // así que proyectamos las velocidades de nuestros sprites en esa normal (capturadas en el
      // vector de desplazamiento) y las utiliza a lo largo del cálculo
      var thisInitialVelocity = p5.Vector.project(this.velocity, displacement);
      var otherInitialVelocity = p5.Vector.project(other.velocity, displacement);

      // Solo nos preocupamos por los valores de masa relativa, así si uno de los sprites
      // se considera 'immovable' (inamovible) trata the _other_ sprite's mass (masa del otro sprite) como cero
      // para obetener los resultados correctos.
      var thisMass = this.mass;
      var otherMass = other.mass;
      if (this.immovable) {
        thisMass = 1;
        otherMass = 0;
      } else if (other.immovable) {
        thisMass = 0;
        otherMass = 1;
      }

      var combinedMass = thisMass + otherMass;
      var coefficientOfRestitution = this.restitution * other.restitution;
      var initialMomentum = p5.Vector.add(
        p5.Vector.mult(thisInitialVelocity, thisMass),
        p5.Vector.mult(otherInitialVelocity, otherMass)
      );
      var thisFinalVelocity = p5.Vector.sub(otherInitialVelocity, thisInitialVelocity)
        .mult(otherMass * coefficientOfRestitution)
        .add(initialMomentum)
        .div(combinedMass);
      var otherFinalVelocity = p5.Vector.sub(thisInitialVelocity, otherInitialVelocity)
        .mult(thisMass * coefficientOfRestitution)
        .add(initialMomentum)
        .div(combinedMass);
      // Elimina la velocidad antes y aplique la velocidad después a ambos miembros.
      this.velocity.sub(thisInitialVelocity).add(thisFinalVelocity);
      other.velocity.sub(otherInitialVelocity).add(otherFinalVelocity);
    }

    // Restaura las propiedades del sprite ahora que han hecho cambios de velocidad.
    // Ver otro bloque antes de los cambios de velocidad que los establecen.
    type = originalType;
    this.immovable = originalThisImmovable;
    other.immovable = originalOtherImmovable;
    other.restitution = originalOtherRestitution;

    // Finalmente, para todos los tipos de colisión excepto 'isTouching', llama el callback
    // y registra la colisión que ocurrió.
    if (typeof callback === 'function' && type !== 'isTouching') {
      callback.call(this, this, other);
    }
    return true;
  };

  this._findDisplacement = function(target) {
    // Multimuestreo si ocurre una tunelización:
    // Haz una detección de fase amplia. Verifica si los colisionadores de barrido se sobreponen.
    // En ese caso, prueba las interpolaciones entre sus últimas posiciones y sus
    // posiciones actuales, y verifica de esa manera la tunelización.
    // Utiliza multitesteo para captar colisionas que de otra manera podríamos pasar por alto.
    if (this._doSweptCollidersOverlap(target)) {
      // Averigua cuantas muestras debemos tomar.
      // Debemos limitar esto para que no tomemos un absurdo número de muestras
      // cuando los objetos terminan en velocidades muy altas (como sucede a veces en
      // motores de juego).
      var radiusOnVelocityAxis = Math.max(
        this.collider._getMinRadius(),
        target.collider._getMinRadius());
      var relativeVelocity = p5.Vector.sub(this.velocity, target.velocity).mag();
      var timestep = Math.max(0.015, radiusOnVelocityAxis / relativeVelocity);
      // Si los objetos son lo suficientemente pequeños para beneficiarse del multimuestreo en esta
      // velocidad relativa
      if (timestep < 1) {
        // Mueve los sprites de regreso a sus posiciones previas
        // (Saltamos a trávess de algunos aros para evitar crear demasiados nuevos
        //  objetos vectores)
        var thisOriginalPosition = this.position.copy();
        var targetOriginalPosition = target.position.copy();
        this.position.set(this.previousPosition);
        target.position.set(target.previousPosition);

        // Scale deltas down to timestep-deltas
        var thisDelta = p5.Vector.sub(thisOriginalPosition, this.previousPosition).mult(timestep);
        var targetDelta = p5.Vector.sub(targetOriginalPosition, target.previousPosition).mult(timestep);

        // Nota: No tenemos que revisar la posición original, podemos asumir que no
        // colisiona (o habría sido majeado en el primer cuadro).
        for (var i = timestep; i < 1; i += timestep) {
          // Move the sprites forward by the sub-frame timestep
          this.position.add(thisDelta);
          target.position.add(targetDelta);
          this.collider.updateFromSprite(this);
          target.collider.updateFromSprite(target);

          // Revisar por colisiones en la nueva posición del sub-cuadro 
          var displacement = this.collider.collide(target.collider);
          if (displacement.x !== 0 || displacement.y !== 0) {
            // Estos sprites se sobreponen - tenemos un desplazamiento, y un
            // punto en el tiempo para la colisión.
            // Si algún sprite es inamovible, debe moverse de regreso a su posición
            // final.  Sino, deja los sprites en su posición 
            // interpolada cuando la colisión ocurrió.
            if (this.immovable) {
              this.position.set(thisOriginalPosition);
            }

            if (target.immovable) {
              target.position.set(targetOriginalPosition);
            }

            return displacement;
          }
        }

        // Si no encontramos un desplazamiento a mitad de camino,
        // restaura los sprites a sus posiciones originales y fracasa
        // para revisar la colisión en sus posición final.
        this.position.set(thisOriginalPosition);
        target.position.set(targetOriginalPosition);
      }
    }

    // Asegura que los colisionadores estén correctamente actualizados para que coincidan con su sprite
    // padre. Tal vez algún día no tengamos que hacerlo, pero por ahora
    // sprites no están garantizados para ser internamiente consistentes hacemos una
    // actualización de último minuto para asegurarnos.
    this.collider.updateFromSprite(this);
    target.collider.updateFromSprite(target);

    return this.collider.collide(target.collider);
  };
} //finalizar clase Sprite 

defineLazyP5Property('Sprite', boundConstructorFactory(Sprite));

/**
   * Una cámara facilita el desplazamiento y el zoom para escenas que se amplían más allá
   * del lienzo. Una cámara tiene una posición, un factor de zoom , y coordenadas
   * del ratón relativas a la vista.
   * La cámara se crea automáticamente en el primer ciclo de dibujo.
   *
   * En términos p5.js la cámara rodea todo el ciclo de dibujo en una
   * matriz transformación pero puede ser inhabilitada en cualquier momento durante el ciclo draw
   * de dibujo por ejemplo para dibujar elementos de interface en una posición absoluta.
   *
   * @class Camera - cámara
   * @constructor - constructor
   * @param {Number} x Coordenada x inicial
   * @param {Number} y Coordenada y inicial
   * @param {Number} aumento de zoom
   **/
function Camera(pInst, x, y, zoom) {
  /**
  * Posición de la cámara. Define el desplazamiento global del boceto.
  *
  * @property position - posición 
  * @type {p5.Vector}
  */
  this.position = pInst.createVector(x, y);

  /**
  * Cámara posición x. Define el desplazamiento global horizontal del boceto.
  *
  * @property x
  * @type {Number}
  */
  Object.defineProperty(this, 'x', {
    enumerable: true,
    get: function() {
      return this.position.x;
    },
    set: function(value) {
      this.position.x = value;
    }
  });

  /**
  * Cámara posición y. Define el desplazamiento global del boceto.
  *
  * @property y
  * @type {Number}
  */
  Object.defineProperty(this, 'y', {
    enumerable: true,
    get: function() {
      return this.position.y;
    },
    set: function(value) {
      this.position.y = value;
    }
  });

  /**
  * Zoom de la cámara. Define la escala global del boceto.
  * Una escala de 1 será el tamaño normal. Establecerlo en 2 hará todo
  * del doble de su mataño. .5 hará todo a mitad de tamaño.
  *
  * @property zoom
  * @type {Number}
  */
  this.zoom = zoom;

  /**
  * MouseX traducido a la vista de la cámara.
  * El desplazamiento y escala del boceto no cambiarán la posición de los sprites
  * ni las variables  mouseX y mouseY. Utiliza esta propiedas para leer la posición
  * del ratón si la cámara se mueve o hace zoom.
  *
  * @property mouseX
  * @type {Number}
  */
  this.mouseX = pInst.mouseX;

  /**
  * MouseY traducido a la vista de la cámara.
  * El desplazamiento y escala del boceto no cambiarán la posición de los sprites
  * ni las variables  mouseX y mouseY. Utiliza esta propiedas para leer la posición
  * del ratón si la cámara se mueve o hace zoom.
  *
  * @property mouseY
  * @type {Number}
  */
  this.mouseY = pInst.mouseY;

  /**
  * Verdadero si la cámara está activada.
  * Propiedad solo de lectura. Utiliza los métodos Camera.on() y Camera.off()
  * para habilitar o inhabilitar la cámara
.
  *
  * @property active - activo
  * @type {Boolean}
  */
  this.active = false;

  /**
  * Revisar para ver si la cámara está activada.
  * Utiliza los métodos Camera.on() y Camera.off()
  * para habilitar o inhabilitar la cámara.
  *
  * @method isActive
  * @return {Boolean} verdadero si la cámara está activa
  */
  this.isActive = function() {
    return this.active;
  };

  /**
  * Activa la cámara.
  * El boceto se dibujará de acuerdo a la posición de la cámara y escala hasta que 
  * se llame Camera.off() 
  *
  * @method on
  */
  this.on = function() {
    if(!this.active)
    {
      cameraPush.call(pInst);
      this.active = true;
    }
  };

  /**
  * Desactiva la cámara.
  * El boceto será dibujado normalmente, ignorando la posición de la cámara
  * y  escala hasta que se llame Camera.on()
  *
  * @method off
  */
  this.off = function() {
    if(this.active)
    {
      cameraPop.call(pInst);
      this.active = false;
    }
  };
} //finalizar la clase camera 

defineLazyP5Property('Camera', boundConstructorFactory(Camera));

//llamado pre sorteo por defecto
function cameraPush() {
  var pInst = this;
  var camera = pInst.camera;

  //incómodo pero necesario para tener la cámara en el centro
  //del boceto por defecto
  if(!camera.init && camera.position.x === 0 && camera.position.y === 0)
    {
    camera.position.x=pInst.width/2;
    camera.position.y=pInst.height/2;
    camera.init = true;
    }

  camera.mouseX = pInst.mouseX+camera.position.x-pInst.width/2;
  camera.mouseY = pInst.mouseY+camera.position.y-pInst.height/2;

  if(!camera.active)
  {
    camera.active = true;
    pInst.push();
    pInst.scale(camera.zoom);
    pInst.translate(-camera.position.x+pInst.width/2/camera.zoom, -camera.position.y+pInst.height/2/camera.zoom);
  }
}

//llamado postdraw por defecto
function cameraPop() {
  var pInst = this;

  if(pInst.camera.active)
  {
    pInst.pop();
    pInst.camera.active = false;
  }
}




/**
   * En p5.play los grupos son colecciones de sprites con comportamiento similar.
   * Por ejemplo un grupo puede contener todos los sprites en el fondo
   * o todos los sprites que "destruyen" al jugador.
   *
   * Los grupos son arrays (arreglos) "extendidos" y heredan todas sus propiedades
   * e.j. group.length
   *
   * Como los grupos solo contienen referencias, un sprite puede estar en múltiples
   * grupos y eleminar un grupo no afecta a los sprites mismos.
   *
   * Sprite.remove() también eliminará el sprite de todos los grupos
   * a los que pertenece.
   *
   * @class Group - Grupo
   * @constructor - constructor
   */
function Group() {

  //básicamente extiende el array
  var array = [];

  /**
  * Consigue el mimebro de index i.
  *
  * @method get - obtener
  * @param {Number} i El índice del objeto a recuperar
  */
  array.get = function(i) {
    return array[i];
  };

  /**
  * Verifica si el grupo contiene un sprite.
  *
  * @method contains - contiene
  * @param {Sprite} sprite El sprite para buscar
  * @return {Number} Índice o -1 si no se encuentra
  */
  array.contains = function(sprite) {
    return this.indexOf(sprite)>-1;
  };

  /**
   * Igual que Group.contains
   * @method indexOf
   */
  array.indexOf = function(item) {
    for (var i = 0, len = array.length; i < len; ++i) {
      if (virtEquals(item, array[i])) {
        return i;
      }
    }
    return -1;
  };

  /**
  * Agrega un sprite a un grupo.
  *
  * @method add - agregar
  * @param {Sprite} s El sprite que se agregará
  */
  array.add = function(s) {
    if(!(s instanceof Sprite)) {
      throw('Error: solo puedes agregar sprites a un grupo');
    }

    if (-1 === this.indexOf(s)) {
      array.push(s);
      s.groups.push(this);
    }
  };

  /**
   * Igual que group.length
   * @method size - tamaño
   */
  array.size = function() {
    return array.length;
  };

  /**
  * Elimina todos los sprites en el grupo
  * de la escena.
  *
  * @method removeSprites
  */
  array.removeSprites = function() {
    while (array.length > 0) {
      array[0].remove();
    }
  };

  /**
  * Elimina todas las referencias al grupo.
  * No elimina los sprites.
  *
  * @method clear - eliminar
  */
  array.clear = function() {
    array.length = 0;
  };

  /**
  * Elimina un sprite del grupo.
  * No elimina el sprite, solo la afiliación (referencia).
  *
  * @method remove - remover
  * @param {Sprite} item El sprite que se eliminará
  * @return {Boolean} Verdadero si se encontró y eliminó el sprite
  */
  array.remove = function(item) {
    if(!(item instanceof Sprite)) {
      throw('Error: solo puedes eliminar sprites de un grupo');
    }

    var i, removed = false;
    for (i = array.length - 1; i >= 0; i--) {
      if (array[i] === item) {
        array.splice(i, 1);
        removed = true;
      }
    }

    if (removed) {
      for (i = item.groups.length - 1; i >= 0; i--) {
        if (item.groups[i] === this) {
          item.groups.splice(i, 1);
        }
      }
    }

    return removed;
  };

  /**
   * Regresa una copia del grupo como un array estándar.
   * @method toArray
   */
  array.toArray = function() {
    return array.slice(0);
  };

  /**
  * Regresa la mayor profundidad en un grupo
  *
  * @method maxDepth
  * @return {Number} La profundidad del sprite dibujado en la parte superior.
  */
  array.maxDepth = function() {
    if (array.length === 0) {
      return 0;
    }

    return array.reduce(function(maxDepth, sprite) {
      return Math.max(maxDepth, sprite.depth);
    }, -Infinity);
  };

  /**
  * Regresa la menor profundidad en un grupo
  *
  * @method minDepth
  * @return {Number} La profundidad del sprite dibujado en la parte inferior.
  */
  array.minDepth = function() {
    if (array.length === 0) {
      return 99999;
    }

    return array.reduce(function(minDepth, sprite) {
      return Math.min(minDepth, sprite.depth);
    }, Infinity);
  };

  /**
  * Dibuja todos los sprites en el grupo.
  *
  * @method draw - dibujar
  */
  array.draw = function() {

    //ordenar por profundidad
    this.sort(function(a, b) {
      return a.depth - b.depth;
    });

    for(var i = 0; i<this.size(); i++)
    {
      this.get(i).display();
    }
  };

  //uso interno
  function virtEquals(obj, other) {
    if (obj === null || other === null) {
      return (obj === null) && (other === null);
    }
    if (typeof (obj) === 'string') {
      return obj === other;
    }
    if (typeof(obj) !== 'object') {
      return obj === other;
    }
    if (obj.equals instanceof Function) {
      return obj.equals(other);
    }
    return obj === other;
  }

  /**
   * Colisiona cada miembro de un grupo contra el blanco utilizando el tipo de colisión
   * dada. Regresa a verdadero si ocurrió alguna colisión.
   * Uso interno
   *
   * @private - privado
   * @method _groupCollide
   * @param {!string} escriba uno de 'overlap', 'collide', 'displace', 'bounce' o 'bounceOff'
   * @param {Object} grupo de destino o Sprite
   * @param {Function} [callback] en colisión.
   * @return {boolean} Verdadero si ocurrió alguna colisión / superposición
   */
  function _groupCollide(type, target, callback) {
    var didCollide = false;
    for(var i = 0; i<this.size(); i++)
      didCollide = this.get(i)._collideWith(type, target, callback) || didCollide;
    return didCollide;
  }

  /**
  * Verifica si el grupo se sobrepone en otro grupo o sprite.
  * La verificación se lleva a cabo utilizando colisionadores. Si los colisionadores no están establecidos
  * serán creados automáticamente de la caja delimitante de la imagen/animación.
  *
  * Una función de callback puede ser especificada para llevar a cabo operaciones adicionales
  * cuando ocurra una sobreposición.
  * La función será llamada por cada uno de los sprite sobrepuesto.
  * El parámetro de la función son respectivamente el
  * miembro del grupo actual y el otro sprite que pasó como parámetro.
  *
  * @example - ejemplo
  *     group.overlap(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method overlap - sobreponer
  * @param {Object} Grupo objetivo o Sprite para compararlo con el actual
  * @param {Function} [callback] La función que se llamará si la superposición es positiva
  * @return {Boolean} Verdadero si se superpone
  */
  array.overlap = _groupCollide.bind(array, 'overlap');

  /**
   * Alias para <a href='#method-overlap'>overlap()</a>
   *
   * Regresa este grupo rebote o no o colisione o no con otro sprite
   * o grupo. Modifica cada objeto de propiedad táctil del sprite.
   *
   * @method isTouching
   * @param {Object} Grupo objetivo o Sprite para compararlo con el actual
   * @return {Boolean} Cierto si toca
   */
  array.isTouching = array.overlap;

  /**
  * Verifica si el grupo se sobrepone en otro grupo o sprite.
  * Si es positivo a la sobreposición el sprite rebotará con el(los) blanco(s)
  * tratados como inamovible con un coeficiente de restitución de cero.
  *
  * La verificación se lleva a cabo utilizando colisionadores. Si los colisionadores no están establecidos
  * serán creados automáticamente de la caja delimitante de la imagen/animación.
  *
  * Una función de callback puede ser especificada para llevar a cabo operaciones adicionales
  * cuando ocurra una sobreposición.
  * La función será llamada por cada uno de los sprite sobrepuestos
  * El parámetro de la función son respectivamente el
  * miembro del grupo actual y el otro sprite que pasó como parámetro.
  *
  * @example - ejemplo 
  *     group.collide(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method collide - colisiona
  * @param {Object} Grupo objetivo o Sprite para compararlo con el actual
  * @param {Function} [callback] La función que se llamará si la superposición es positiva
  * @return {Boolean} Verdadero si se superpone
  */
  array.collide = _groupCollide.bind(array, 'collide');

  /**
  * Verifica si el grupo se sobrepone en otro grupo o sprite.
  * Si es positivo a la sobreposición los sprites del grupo desplazarán
  * a los colisionados a las posiciones más cercanas que no sobreponen.
  *
  * La verificación se lleva a cabo utilizando colisionadores. Si los colisionadores no están establecidos
  * serán creados automáticamente de la caja delimitante de la imagen/animación.
  *
  * Una función de callback puede ser especificada para llevar a cabo operaciones adicionales
  * cuando ocurra una sobreposición.
  * La función será llamada por cada uno de los sprite sobrepuestos.
  * El parámetro de la función son respectivamente el
  * miembro del grupo actual y el otro sprite que pasó como parámetro.
  *
  * @example - ejemplo
  *     group.displace(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method displace - desplazar
  * @param {Object} Grupo objetivo o Sprite para compararlo con el actual
  * @param {Function} [callback] La función que se llamará si la superposición es positiva
  * @return {Boolean} Verdadero si se superpone
  */
  array.displace = _groupCollide.bind(array, 'displace');

  /**
  * Verifica si el grupo se sobrepone en otro grupo o sprite.
  * Si es positivo a la sobreposición los sprites rebotarán afectando 
  * la trayectoria uno del otro dependiendo de su .velocity (velocidad), .mass (masa) y .restitution (restitución).
  *
  * La verificación se lleva a cabo utilizando colisionadores. Si los colisionadores no están establecidos
  * serán creados automáticamente de la caja delimitante de la imagen/animación.
  *
  * Una función de callback puede ser especificada para llevar a cabo operaciones adicionales
  * cuando ocurra una sobreposición.
  * La función será llamada por cada uno de los sprite sobrepuestos.
  * El parámetro de la función son respectivamente el
  * miembro del grupo actual y el otro sprite que pasó como parámetro.
  *
  * @example - ejemplo
  *     group.bounce(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method bounce - rebotar
  * @param {Object} Grupo objetivo o Sprite para compararlo con el actual
  * @param {Function} [callback] La función que se llamará si la superposición es positiva
  * @return {Boolean} Verdadero si se superpone
  */
  array.bounce = _groupCollide.bind(array, 'bounce');

  /**
  * Verifica si el grupo se sobrepone en otro grupo o sprite.
  * Si es positivo a la sobreposición los sprites rebotarán con el (los) blanco(s)
  * tratados como inamovibles.
  *
  * La verificación se lleva a cabo utilizando colisionadores. Si los colisionadores no están establecidos
  * serán creados automáticamente de la caja delimitante de la imagen/animación.
  *
  * Una función de callback puede ser especificada para llevar a cabo operaciones adicionales
  * cuando ocurra una sobreposición.
  * La función será llamada por cada uno de los sprite sobrepuestos.
  * El parámetro de la función son respectivamente el
  * miembro del grupo actual y el otro sprite que pasó como parámetro.
  *
  * @example - ejemplo
  *     group.bounceOff(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method bounceOff - rebotar en 
  * @param {Object} Grupo objetivo o Sprite para compararlo con el actual
  * @param {Function} [callback] La función que se llamará si la superposición es positiva
  * @return {Boolean} Verdadero si se superpone
  */
  array.bounceOff = _groupCollide.bind(array, 'bounceOff');

  array.setPropertyEach = function(propName, value) {
    for (var i = 0; i < this.length; i++) {
      this[i][propName] = value;
    }
  };

  array.callMethodEach = function(methodName) {
    // Copia todos los argumentos después del primer parámetro en methodArgs:
    var methodArgs = Array.prototype.slice.call(arguments, 1);
    // Usa una copia de la matriz en caso de que el método modifique el grupo
    var elements = [].concat(this);
    for (var i = 0; i < elements.length; i++) {
      elements[i][methodName].apply(elements[i], methodArgs);
    }
  };

  array.setDepthEach = array.setPropertyEach.bind(array, 'depth');
  array.setLifetimeEach = array.setPropertyEach.bind(array, 'lifetime');
  array.setRotateToDirectionEach = array.setPropertyEach.bind(array, 'rotateToDirection');
  array.setRotationEach = array.setPropertyEach.bind(array, 'rotation');
  array.setRotationSpeedEach = array.setPropertyEach.bind(array, 'rotationSpeed');
  array.setScaleEach = array.setPropertyEach.bind(array, 'scale');
  array.setColorEach = array.setPropertyEach.bind(array, 'shapeColor');
  array.setTintEach = array.setPropertyEach.bind(array, 'tint');
  array.setVisibleEach = array.setPropertyEach.bind(array, 'visible');
  array.setVelocityXEach = array.setPropertyEach.bind(array, 'velocityX');
  array.setVelocityYEach = array.setPropertyEach.bind(array, 'velocityY');
  array.setHeightEach = array.setPropertyEach.bind(array, 'height');
  array.setWidthEach = array.setPropertyEach.bind(array, 'width');

  array.destroyEach = array.callMethodEach.bind(array, 'destroy');
  array.pointToEach = array.callMethodEach.bind(array, 'pointTo');
  array.setAnimationEach = array.callMethodEach.bind(array, 'setAnimation');
  array.setColliderEach = array.callMethodEach.bind(array, 'setCollider');
  array.setSpeedAndDirectionEach = array.callMethodEach.bind(array, 'setSpeedAndDirection');
  array.setVelocityEach = array.callMethodEach.bind(array, 'setVelocity');
  array.setMirrorXEach = array.callMethodEach.bind(array, 'mirrorX');
  array.setMirrorYEach = array.callMethodEach.bind(array, 'mirrorY');

  return array;
}

p5.prototype.Group = Group;

/**
 * Crea sprites de cuatro bordes y agrégalos a un grupo. Cada borde es justo fuera
 * del boceto y tiene un grosor de 100. Después de llamar la función,
 * las siguientes propiedades se expononen y se poblan con sprites:
 * leftEdge (borde izquierdo), rightEdge (borde derecho), topEdge (borde superior), bottomEdge (borde inferior)
 *
 * La propiedad 'edges' (bordes) se pobla con un grupo que contiene esos cuatro sprites.
 *
 * Si los bordes de los sprites ya fueron creados, la función regresa 
 * el grupo de bordes existentes de inmediato.
 *
 * @method createEdgeSprites
 * @return {Group} El grupo de bordes
 */
p5.prototype.createEdgeSprites = function() {
  if (this.edges) {
    return this.edges;
  }

  var edgeThickness = 100;

  var width = this._curElement.elt.offsetWidth;
  var height = this._curElement.elt.offsetHeight;

  this.leftEdge = this.createSprite(-edgeThickness / 2, height / 2, edgeThickness, height);
  this.rightEdge = this.createSprite(width + (edgeThickness / 2), height / 2, edgeThickness, height);
  this.topEdge = this.createSprite(width / 2, -edgeThickness / 2, width, edgeThickness);
  this.bottomEdge = this.createSprite(width / 2, height + (edgeThickness / 2), width, edgeThickness);

  this.edges = this.createGroup();
  this.edges.add(this.leftEdge);
  this.edges.add(this.rightEdge);
  this.edges.add(this.topEdge);
  this.edges.add(this.bottomEdge);

  return this.edges;
};

/**
 * Un objeto de animación contiene una serie de imágenes (p5.Image) que
 * se pueden mostrar en orden.
 *
 * Todos los archivos deben ser imágenes png. Debes incluir el directorio de la raíz del boceto,
 * y la extensión .png
 *
 * Un sprite puede tener múltiples animaciones etiquetadas, ver Sprite.addAnimation
 * y Sprite.changeAnimation, sin embargo una animación puede ser utilizada independientemente.
 *
 * Se puede crear una animación ya sea pasando una serie de nombres de archivos,
 * sin importar cuántos o pasando el nombre del primer y el último archivo
 * de una secuencia numérica.
 * p5.play will try to detect the sequence pattern.
 *
 * Por ejemplo si los nombres de archivos dados son
 * "data/file0001.png" and "data/file0005.png" las imágenes
 * "data/file0003.png" and "data/file0004.png" también serán cargadas.
 *
 * @example - ejemplo
 *     var sequenceAnimation;
 *     var glitch;
 *
 *     function preload() {
 *       sequenceAnimation = loadAnimation("data/walking0001.png", "data/walking0005.png");
 *       glitch = loadAnimation("data/dog.png", "data/horse.png", "data/cat.png", "data/snake.png");
 *     }
 *
 *     function setup() {
 *       createCanvas(800, 600);
 *     }
 *
 *     function draw() {
 *       background(0);
 *       animation(sequenceAnimation, 100, 100);
 *       animation(glitch, 200, 100);
 *     }
 *
 * @class Animation - Animación
 * @constructor - constructor
 * @param {String} fileName1 Primer archivo de una secuencia O primer archivo de imagen
 * @param {String} fileName2 Último archivo de una secuencia O segundo archivo de imagen
 * @param {String} [...fileNameN] Cualquier cantidad de archivos de imagen después de los dos primeros
 */
function Animation(pInst) {
  var frameArguments = Array.prototype.slice.call(arguments, 1);
  var i;

  var CENTER = p5.prototype.CENTER;

  /**
  * Matriz de cuadros(p5.Imagen)
  *
  * @property images - imagenes
  * @type {Array}
  */
  this.images = [];

  var frame = 0;
  var cycles = 0;
  var targetFrame = -1;

  this.offX = 0;
  this.offY = 0;

  /**
  * Retraso entre los cuadros en número de ciclos de dibujo.
  * Si se establecen en 4 los cuadros de una animación serían los
  * cuadros del boceto dividos entre 4 (60fps = 15fps)
  *
  * @property frameDelay
  * @type {Number}
  * @default 2
  */
  this.frameDelay = 4;

  /**
  * Verdadero si la animación está reproduciéndose actualmente.
  *
  * @property playing - reproduciéndose
  * @type {Boolean}
  * @default true
  */
  this.playing = true;

  /**
  * Visibilidad de la animación.
  *
  * @property visible - visible
  * @type {Boolean}
  * @default true
  */
  this.visible = true;

  /**
  * Si se establece falso la animación se detendrá después de buscar el último cuadro
  *
  * @property looping - bucle
  * @type {Boolean}
  * @default true - verdadero
  */
  this.looping = true;

  /**
  * Verdadero si el cuadro cambió durante el último ciclo de dibujo
  *
  * @property frameChanged
  * @type {Boolean}
  */
  this.frameChanged = false;

  //es el colisionador definido manualmente o definido
  //por el tamaño de cuadro actual
  this.imageCollider = false;


  //modo de secuencia 
  if(frameArguments.length === 2 && typeof frameArguments[0] === 'string' && typeof frameArguments[1] === 'string')
  {
    var from = frameArguments[0];
    var to = frameArguments[1];

    //print("modo de secuencia "+from+" -> "+to);

    //aségurate que las extensiones son correctas
    var ext1 = from.substring(from.length-4, from.length);
    if(ext1 !== '.png')
    {
      pInst.print('Error de animación: necesita usar archivos .png (filename '+from+')');
      from = -1;
    }

    var ext2 = to.substring(to.length-4, to.length);
    if(ext2 !== '.png')
    {
      pInst.print('Error de animación: necesita usar archivos .png (filename '+to+')');
      to = -1;
    }

    //las extensiones están correctas
    if(from !== -1 && to !== -1)
    {
      var digits1 = 0;
      var digits2 = 0;

      //skip extension work backwards to find the numbers
      for (i = from.length-5; i >= 0; i--) {
        if(from.charAt(i) >= '0' && from.charAt(i) <= '9')
          digits1++;
      }

      for (i = to.length-5; i >= 0; i--) {
        if(to.charAt(i) >= '0' && to.charAt(i) <= '9')
          digits2++;
      }

      var prefix1 = from.substring(0, from.length-(4+digits1));
      var prefix2 = to.substring(0, to.length-(4+digits2) );

      // Nuestros números probablemente tienen ceros al inicio, que significa que algunos
      // buscadores (e.g., PhantomJS) los interpretarán como base de 8 (octal)
      // en lugar de decimal. Para corregirlo, le diremos explícitamente a parseInt que
      // utilice base de 10 (decimal). Para más detalles sobre este asunto, ver
      // http://stackoverflow.com/a/8763427/2422398.
      var number1 = parseInt(from.substring(from.length-(4+digits1), from.length-4), 10);
      var number2 = parseInt(to.substring(to.length-(4+digits2), to.length-4), 10);

      //intercambia si está invertido
      if(number2<number1)
      {
        var t = number2;
        number2 = number1;
        number1 = t;
      }

      //dos cuadros diferentes
      if(prefix1 !== prefix2 )
      {
        //print("2 separate images");
        this.images.push(pInst.loadImage(from));
        this.images.push(pInst.loadImage(to));
      }
      //same digits: case img0001, img0002
      else
      {
        var fileName;
        if(digits1 === digits2)
        {

          //carga todas las imágenes
          for (i = number1; i <= number2; i++) {
            // Use nf () para numerar el formato 'i' en cuatro dígitos
            fileName = prefix1 + pInst.nf(i, digits1) + '.png';
            this.images.push(pInst.loadImage(fileName));

          }

        }
        else //case: case img1, img2
        {
          //print("from "+prefix1+" "+number1 +" to "+number2);
          for (i = number1; i <= number2; i++) {
            // Use nf () para numerar el formato 'i' en cuatro dígitos
            fileName = prefix1 + i + '.png';
            this.images.push(pInst.loadImage(fileName));

          }

        }
      }

    }//no terminar error ext

  }//modo de fin de secuencia
  // Modo de hoja de Sprite
  else if (frameArguments.length === 1 && (frameArguments[0] instanceof SpriteSheet))
  {
    this.spriteSheet = frameArguments[0];
    this.images = this.spriteSheet.frames.map( function(f) {
      if (f.spriteSourceSize && f.sourceSize) {
        return Object.assign(f.frame, {
          width: f.frame.w,
          height: f.frame.h,
          sourceX: f.spriteSourceSize.x,
          sourceY: f.spriteSourceSize.y,
          sourceW: f.sourceSize.w,
          sourceH: f.sourceSize.h,
        });
      }
      return f.frame;
    });
  }
  else if(frameArguments.length !== 0)//lista arbitraria de imágenes
  {
    //print("Modo arbitrario de animación");
    for (i = 0; i < frameArguments.length; i++) {
      //print("loading "+fileNames[i]);
      if(frameArguments[i] instanceof p5.Image)
        this.images.push(frameArguments[i]);
      else
        this.images.push(pInst.loadImage(frameArguments[i]));
    }
  }

  /**
  * Los objetos pasan por referencia así que para tener diferentes sprites
  * utilizando la misma animación necesitas clonarlo.
  *
  * @method clone - clonar
  * @return {Animation} Un clon de la animación actual.
  */
  this.clone = function() {
    var myClone = new Animation(pInst); //vacío
    myClone.images = [];

    if (this.spriteSheet) {
      myClone.spriteSheet = this.spriteSheet.clone();
    }
    myClone.images = this.images.slice();

    myClone.offX = this.offX;
    myClone.offY = this.offY;
    myClone.frameDelay = this.frameDelay;
    myClone.playing = this.playing;
    myClone.looping = this.looping;

    return myClone;
  };

  /**
   * Dibuja la animación en la coordenada x & y.
   * Actualiza los cuadros automáticamente
   *
   * @method draw - dibujar
   * @param {Number} coordenada x, x
   * @param {Number} coordenada y, y 
   * @param {Number} [r=0] rotation - rotación
   */
  this.draw = function(x, y, r) {
    this.xpos = x;
    this.ypos = y;
    this.rotation = r || 0;

    if (this.visible)
    {

      // solo conexión con la clase sprite
      //si la animación se usa independientemente dibuja y actualiza es lo mismo
      if(!this.isSpriteAnimation)
        this.update();

      //this.currentImageMode = g.imageMode;
      pInst.push();
      pInst.imageMode(CENTER);

      var xTranslate = this.xpos;
      var yTranslate = this.ypos;
      var image = this.images[frame];
      var frame_info = this.spriteSheet && image;

      // Adjusta la traducción si estamos lidiando con una hoja de sprite con textura empaquetada
      // (con accesorios sourceW, sourceH, sourceX, sourceY en nuestra matriz de imágenes)
      if (frame_info) {
        var missingX = (frame_info.sourceW || frame_info.width) - frame_info.width;
        var missingY = (frame_info.sourceH || frame_info.height) - frame_info.height;
        // Si el recuento de píxeles faltantes (transparentes) no está igualmente equilibrado 
        // a la izquierda frente a la derecha o arriba frente a abajo, ajustamos la traducción:
        xTranslate += ((frame_info.sourceX || 0) - missingX / 2);
        yTranslate += ((frame_info.sourceY || 0) - missingY / 2);
      }

      pInst.translate(xTranslate, yTranslate);
      if (pInst._angleMode === pInst.RADIANS) {
        pInst.rotate(radians(this.rotation));
      } else {
        pInst.rotate(this.rotation);
      }

      if (frame_info) {
        if (this.spriteSheet.image instanceof Image) {
          pInst.imageElement(this.spriteSheet.image,
            frame_info.x, frame_info.y,
            frame_info.width, frame_info.height,
            this.offX, this.offY,
            frame_info.width, frame_info.height);
        } else {
          pInst.image(this.spriteSheet.image,
            frame_info.x, frame_info.y,
            frame_info.width, frame_info.height,
            this.offX, this.offY,
            frame_info.width, frame_info.height);
          }
      } else if (image) {
        if (image instanceof Image) {
          pInst.imageElement(image, this.offX, this.offY);
        } else {
          pInst.image(image, this.offX, this.offY);
        }
      } else {
        pInst.print('Advertencia cuadro indefinido '+frame);
        //this.isActive = false;
      }

      pInst.pop();
    }
  };

  //llamado por el dibujo
  this.update = function() {
    cycles++;
    var previousFrame = frame;
    this.frameChanged = false;


    //ve al cuadro
    if(this.images.length === 1)
    {
      this.playing = false;
      frame = 0;
    }

    if ( this.playing && cycles%this.frameDelay === 0)
    {
      //ve a target frame up 
      if(targetFrame>frame && targetFrame !== -1)
      {
        frame++;
      }
      //ve a target frame down
      else if(targetFrame<frame && targetFrame !== -1)
      {
        frame--;
      }
      else if(targetFrame === frame && targetFrame !== -1)
      {
        this.playing=false;
      }
      else if (this.looping) //advance frame
      {
        //si el siguiente cuadro es muy alto
        if (frame>=this.images.length-1)
          frame = 0;
        else
          frame++;
      } else
      {
        //si el siguiente cuadro es muy alto
        if (frame<this.images.length-1)
          frame++;
        else
          this.playing = false;
      }
    }

    if(previousFrame !== frame)
      this.frameChanged = true;

  };//actualización final

  /**
  * Reproduce la animación.
  *
  * @method play - repoducir
  */
  this.play = function() {
    this.playing = true;
    targetFrame = -1;
  };

  /**
  * Detén la animación.
  *
  * @method stop - detener
  */
  this.stop = function(){
    this.playing = false;
  };

  /**
  * Retrocede la animación al primer cuadro.
  *
  * @method rewind - rebobinar
  */
  this.rewind = function() {
    frame = 0;
  };

  /**
  * Cambia el cuadro actual.
  *
  * @method changeFrame
  * @param {Number} frame Número de cuadro (comienza desde 0).
  */
  this.changeFrame = function(f) {
    if (f<this.images.length)
      frame = f;
    else
      frame = this.images.length - 1;

    targetFrame = -1;
    //this.playing = false;
  };

  /**
   * Ve al siguiente cuadro y détenlo.
   *
   * @method nextFrame
   */
  this.nextFrame = function() {

    if (frame<this.images.length-1)
      frame = frame+1;
    else if(this.looping)
      frame = 0;

    targetFrame = -1;
    this.playing = false;
  };

  /**
   * Ve al cuadro previo y détenlo.
   *
   * @method previousFrame
   */
  this.previousFrame = function() {

    if (frame>0)
      frame = frame-1;
    else if(this.looping)
      frame = this.images.length-1;

    targetFrame = -1;
    this.playing = false;
  };

  /**
  * Reproduce la animación hacia adelante o hacia atrás hacia un cuadro blanco.
  *
  * @method goToFrame
  * @param {Number} toFrame Frame number destination (starts from 0)
  */
  this.goToFrame = function(toFrame) {
    if(toFrame < 0 || toFrame >= this.images.length) {
      return;
    }

    // targetFrame se utiliza por el método update() method para decidir que cuadro
    // seleccionar después.  Cuando no se está utilizando se establece en -1.
    targetFrame = toFrame;

    if(targetFrame !== frame) {
      this.playing = true;
    }
  };

  /**
  * Regresa al actual número de cuadro.
  *
  * @method getFrame
  * @return {Number} Cuadro actual (comienza desde 0)
  */
  this.getFrame = function() {
    return frame;
  };

  /**
  * Regresa al último número de cuadro.
  *
  * @method getLastFrame
  * @return {Number} Último número del cuadro (comienza desde 0)
  */
  this.getLastFrame = function() {
    return this.images.length-1;
  };

  /**
  * Regresa al cuadro actual de la imagen como p5.Image.
  *
  * @method getFrameImage
  * @return {p5.Image} Imagen del cuadro actual
  */
  this.getFrameImage = function() {
    return this.images[frame];
  };

  /**
  * Regresa a la imagen del cuadro en un número específico de cuadro.
  *
  * @method getImageAt
  * @param {Number} frame - cuadro. Número de cuadros
  * @return {p5.Image} Imagen del cuadro
  */
  this.getImageAt = function(f) {
    return this.images[f];
  };

  /**
  * Regresa al ancho del cuadro actual en pixeles.
  * Si no hay ninguna imagen cargada, regresa 1.
  *
  * @method getWidth
  * @return {Number} Frame width
  */
  this.getWidth = function() {
    if (this.images[frame]) {
      return this.images[frame].sourceW || this.images[frame].width;
    } else {
      return 1;
    }
  };

  /**
  * Regresa a la altura del cuadro actual en pixeles.
  * Si no hay niguna imagen cargada, regresa 1.
  *
  * @method getHeight
  * @return {Number} Altura del cuadro
  */
  this.getHeight = function() {
    if (this.images[frame]) {
      return this.images[frame].sourceH || this.images[frame].height;
    } else {
      return 1;
    }
  };

}

defineLazyP5Property('Animation', boundConstructorFactory(Animation));

/**
 * Representa una hoja de sprite y todos sus cuadros.  Para utilizarse con animación,
 * o dibujos estáticos de cuadros individuales.
 *
 *  Hay dos maneras diferentes de carfar una SpriteSheet (hoja de Sprite)
 *
 * 1. Dado el ancho, la altura se usará para cada cuadro y el
 *    númbero de cuadros para atravesar. La hora de sprite debe tener una
 *    retícula uniforme con filas y columnas consistentes.
 *
 * 2. Dado un array de objetos de cuadros que define la posición y
 *    las dimensiones de cada marco.  Esto es Flexible porque puedes usar
 *    hojas de sprite que no tienen filas y columnos uniformes.
 *
 * @example - ejemplo 
 *     // Método 1: uso de ancho, alto para cada marco y número de marcos
 *     explode_sprite_sheet = loadSpriteSheet('assets/explode_sprite_sheet.png', 171, 158, 11);
 *
 *     // Método 2: usar una matriz de objetos que definen cada cuadro
 *     var player_frames = loadJSON('assets/tiles.json');
 *     player_sprite_sheet = loadSpriteSheet('assets/player_spritesheet.png', player_frames);
 *
 * @class SpriteSheet
 * @constructor - constructor 
 * @param image - imagen. Ruta de la imagen de cadena u objeto p5.Image
 */
function SpriteSheet(pInst) {
  var spriteSheetArgs = Array.prototype.slice.call(arguments, 1);

  this.image = null;
  this.frames = [];
  this.frame_width = 0;
  this.frame_height = 0;
  this.num_frames = 0;

  /**
   * Genera la información de los cuadros para esta hoja de sprite basada en parámetros de usuarios
   * @private - privado 
   * @method _generateSheetFrames
   */
  this._generateSheetFrames = function() {
    var sX = 0, sY = 0;
    for (var i = 0; i < this.num_frames; i++) {
      this.frames.push(
        {
          'name': i,
          'frame': {
            'x': sX,
            'y': sY,
            'width': this.frame_width,
            'height': this.frame_height
          }
        });
      sX += this.frame_width;
      if (sX >= this.image.width) {
        sX = 0;
        sY += this.frame_height;
        if (sY >= this.image.height) {
          sY = 0;
        }
      }
    }
  };

  var shortArgs = spriteSheetArgs.length === 2 || spriteSheetArgs.length === 3;
  var longArgs = spriteSheetArgs.length === 4 || spriteSheetArgs.length === 5;

  if (shortArgs && Array.isArray(spriteSheetArgs[1])) {
    this.frames = spriteSheetArgs[1];
    this.num_frames = this.frames.length;
  } else if (longArgs &&
    (typeof spriteSheetArgs[1] === 'number') &&
    (typeof spriteSheetArgs[2] === 'number') &&
    (typeof spriteSheetArgs[3] === 'number')) {
    this.frame_width = spriteSheetArgs[1];
    this.frame_height = spriteSheetArgs[2];
    this.num_frames = spriteSheetArgs[3];
  }

  if(spriteSheetArgs[0] instanceof p5.Image || spriteSheetArgs[0] instanceof Image) {
    this.image = spriteSheetArgs[0];
    if (longArgs) {
      this._generateSheetFrames();
    }
  } else {
    // Cuando el argumento final está presente (ya sea el 3rd o el 5th), indica
    // si debemos cargar la URL como un elemento Image (a diferencia del comportamiento
    // por defecto, que es cargarlo como un p5.Image). Si ese argumento es una función,
    // será llamado de regreso una vez que la carga tenda éxito o falle. En caso de éxito, la Image
    // se suministrará como único parámetro. En caso de fallo, null se suministrará.
    var callback;
    if (shortArgs) {
      if (spriteSheetArgs[2]) {
        if (typeof spriteSheetArgs[2] === 'function') {
          callback = spriteSheetArgs[2];
        }
        this.image = pInst.loadImageElement(
          spriteSheetArgs[0],
          function(img) { if (callback) return callback(img); },
          function() { if (callback) return callback(null); }
        );
      } else {
        this.image = pInst.loadImage(spriteSheetArgs[0]);
      }
    } else if (longArgs) {
      var generateSheetFrames = this._generateSheetFrames.bind(this);
      if (spriteSheetArgs[4]) {
        if (typeof spriteSheetArgs[4] === 'function') {
          callback = spriteSheetArgs[4];
        }
        this.image = pInst.loadImageElement(
          spriteSheetArgs[0],
          function(img) {
            generateSheetFrames(img);
            if (callback) return callback(img);
          },
          function() { if (callback) return callback(null); }
        );
      } else {
        this.image = pInst.loadImage(spriteSheetArgs[0], generateSheetFrames);
      }
    }
  }

  /**
   * Dibuja un marco específico en el lienzo.
   * @param frame_name  Puede ser un nombre de cadena o un índice numérico.
   * @param x   posición x para dibujar el marco en
   * @param y   posición y para dibujar el marco en
   * @param [width]   ancho opcional para dibujar el marco
   * @param [height]  altura opcional para dibujar el marco
   * @method drawFrame
   */
  this.drawFrame = function(frame_name, x, y, width, height) {
    var frameToDraw;
    if (typeof frame_name === 'number') {
      frameToDraw = this.frames[frame_name];
    } else {
      for (var i = 0; i < this.frames.length; i++) {
        if (this.frames[i].name === frame_name) {
          frameToDraw = this.frames[i];
          break;
        }
      }
    }
    var frameWidth = frameToDraw.frame.width || frameToDraw.frame.w;
    var frameHeight = frameToDraw.frame.height || frameToDraw.frame.h;
    var dWidth = width || frameWidth;
    var dHeight = height || frameHeight;

    // Adjusta como dibujamos si estamos lidiando con una hoja de sprite con textura empaquetada
    // (en particular, tratamos los parámetros del ancho y la altura suministrada como una intención
    //  para escalar frente al sourceSize [before packing])
    if (frameToDraw.spriteSourceSize && frameToDraw.sourceSize) {
      var frameSizeScaleX = frameWidth / frameToDraw.sourceSize.w;
      var frameSizeScaleY = frameHeight / frameToDraw.sourceSize.h;
      if (width) {
        x += (frameToDraw.spriteSourceSize.x * dWidth / frameToDraw.sourceSize.w);
        dWidth = width * frameSizeScaleX;
      } else {
        x += frameToDraw.spriteSourceSize.x;
      }
      if (height) {
        y += (frameToDraw.spriteSourceSize.y * dHeight / frameToDraw.sourceSize.h);
        dHeight = height * frameSizeScaleY;
      } else {
        y += frameToDraw.spriteSourceSize.y;
      }
    }
    if (this.image instanceof Image) {
      pInst.imageElement(this.image, frameToDraw.frame.x, frameToDraw.frame.y,
        frameToDraw.frame.width, frameToDraw.frame.height, x, y, dWidth, dHeight);
    } else {
      pInst.image(this.image, frameToDraw.frame.x, frameToDraw.frame.y,
        frameToDraw.frame.width, frameToDraw.frame.height, x, y, dWidth, dHeight);
    }
  };

  /**
   * Los objetos pasan por referencia para tener diferentes sprites
   * utilizando la misma animación que necesitas clonar.
   *
   * @method clone - clon
   * @return {SpriteSheet} Un clon de la SpriteSheet actual
   */
  this.clone = function() {
    var myClone = new SpriteSheet(pInst); /vacío

    // Clonar en profundidad los cuadros por valor, no por referencia
    for(var i = 0; i < this.frames.length; i++) {
      var frame = this.frames[i].frame;
      var cloneFrame = {
        'name':frame.name,
        'frame': {
          'x':frame.x,
          'y':frame.y,
          'width':frame.width,
          'height':frame.height
        }
      };
      myClone.frames.push(cloneFrame);
    }

    // clonar otros campos
    myClone.image = this.image;
    myClone.frame_width = this.frame_width;
    myClone.frame_height = this.frame_height;
    myClone.num_frames = this.num_frames;

    return myClone;
  };
}

defineLazyP5Property('SpriteSheet', boundConstructorFactory(SpriteSheet));

//constructor general para ser capaz de alimentar argumentos como array
function construct(constructor, args) {
  function F() {
    return constructor.apply(this, args);
  }
  F.prototype = constructor.prototype;
  return new F();
}





/*
 * Javascript Quadtree
 * basado en
 * https://github.com/timohausmann/quadtree-js/
 * Derechos de autor © 2012 Timo Hausmann
*/

function Quadtree( bounds, max_objects, max_levels, level ) {

  this.active = true;
  this.max_objects	= max_objects || 10;
  this.max_levels		= max_levels || 4;

  this.level 			= level || 0;
  this.bounds 		= bounds;

  this.objects 		= [];
  this.object_refs	= [];
  this.nodes 			= [];
}

Quadtree.prototype.updateBounds = function() {

  //encontrar área máxima
  var objects = this.getAll();
  var x = 10000;
  var y = 10000;
  var w = -10000;
  var h = -10000;

  for( var i=0; i < objects.length; i++ )
    {
      if(objects[i].position.x < x)
        x = objects[i].position.x;
      if(objects[i].position.y < y)
        y = objects[i].position.y;
      if(objects[i].position.x > w)
        w = objects[i].position.x;
      if(objects[i].position.y > h)
        h = objects[i].position.y;
    }


  this.bounds = {
    x:x,
    y:y,
    width:w,
    height:h
  };
  //print(this.bounds);
};

/*
	 * Split the node into 4 subnodes
	 */
Quadtree.prototype.split = function() {

  var nextLevel	= this.level + 1,
      subWidth	= Math.round( this.bounds.width / 2 ),
      subHeight 	= Math.round( this.bounds.height / 2 ),
      x 			= Math.round( this.bounds.x ),
      y 			= Math.round( this.bounds.y );

  //nodo superior derecho
  this.nodes[0] = new Quadtree({
    x	: x + subWidth,
    y	: y,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);

  //nodo superior izquierdo
  this.nodes[1] = new Quadtree({
    x	: x,
    y	: y,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);

  //nodo inferior izquierdo
  this.nodes[2] = new Quadtree({
    x	: x,
    y	: y + subHeight,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);

  //nodo inferior derecho
  this.nodes[3] = new Quadtree({
    x	: x + subWidth,
    y	: y + subHeight,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);
};


/*
	 * Determina el cuadrante para un área en este nodo
	 */
Quadtree.prototype.getIndex = function( pRect ) {
  if(!pRect.collider)
    return -1;
  else
  {
    var colliderBounds = pRect.collider.getBoundingBox();
    var index 				= -1,
        verticalMidpoint 	= this.bounds.x + (this.bounds.width / 2),
        horizontalMidpoint 	= this.bounds.y + (this.bounds.height / 2),

        //pRect puede caber completamente dentro de los cuadrantes superiores
        topQuadrant = (colliderBounds.top < horizontalMidpoint && colliderBounds.bottom < horizontalMidpoint),

        //pRect puede caber completamente dentro de los cuadrantes inferiores
        bottomQuadrant = (colliderBounds.top > horizontalMidpoint);

    //pRect puede caber completamente dentro de los cuadrantes izquierdos
    if (colliderBounds.left < verticalMidpoint && colliderBounds.right < verticalMidpoint ) {
      if( topQuadrant ) {
        index = 1;
      } else if( bottomQuadrant ) {
        index = 2;
      }

      //pRect puede caber completamente dentro de los cuadrantes correctos
    } else if( colliderBounds.left > verticalMidpoint ) {
      if( topQuadrant ) {
        index = 0;
      } else if( bottomQuadrant ) {
        index = 3;
      }
    }

    return index;
  }
};


/*
	 * Inserta un objecto en el nodo. Si el nodo
	 * excede la capacidad, dividirá y agregará todos
	 * los objetos a sus subnodos correspondientes.
	 */
Quadtree.prototype.insert = function( obj ) {
  //evitar la doble inserción
  if(this.objects.indexOf(obj) === -1)
  {

    var i = 0,
        index;

    //si tenemos subnodos ...
    if( typeof this.nodes[0] !== 'undefined' ) {
      index = this.getIndex( obj );

      if( index !== -1 ) {
        this.nodes[index].insert( obj );
        return;
      }
    }

    this.objects.push( obj );

    if( this.objects.length > this.max_objects && this.level < this.max_levels ) {

      //dividir si ya no tenemos subnodos
      if( typeof this.nodes[0] === 'undefined' ) {
        this.split();
      }

      //agregar todos los objetos a sus correspondientes subnodos
      while( i < this.objects.length ) {

        index = this.getIndex( this.objects[i] );

        if( index !== -1 ) {
          this.nodes[index].insert( this.objects.splice(i, 1)[0] );
        } else {
          i = i + 1;
        }
      }
    }
  }
};


/*
	 * Devuelve todos los objetos que podrían chocar con un área determinada
	 */
Quadtree.prototype.retrieve = function( pRect ) {


  var index = this.getIndex( pRect ),
      returnObjects = this.objects;

  //si tenemos subnodos ...
  if( typeof this.nodes[0] !== 'undefined' ) {

    //si pRect entra en un subnodo ..
    if( index !== -1 ) {
      returnObjects = returnObjects.concat( this.nodes[index].retrieve( pRect ) );

      //s pRect no entra en un subnodo, verifícalo en todos los subnodos
    } else {
      for( var i=0; i < this.nodes.length; i=i+1 ) {
        returnObjects = returnObjects.concat( this.nodes[i].retrieve( pRect ) );
      }
    }
  }

  return returnObjects;
};

Quadtree.prototype.retrieveFromGroup = function( pRect, group ) {

  var results = [];
  var candidates = this.retrieve(pRect);

  for(var i=0; i<candidates.length; i++)
    if(group.contains(candidates[i]))
    results.push(candidates[i]);

  return results;
};

/*
	 * Obtener todos los objetos almacenados en el quadtree
	 */
Quadtree.prototype.getAll = function() {

  var objects = this.objects;

  for( var i=0; i < this.nodes.length; i=i+1 ) {
    objects = objects.concat( this.nodes[i].getAll() );
  }

  return objects;
};


/*
	 * Obtener el nodo en el que se almacena un determinado objeto.
	 */
Quadtree.prototype.getObjectNode = function( obj ) {

  var index;

  //si no hay subnodos, el objeto debe ir aquí
  if( !this.nodes.length ) {

    return this;

  } else {

    index = this.getIndex( obj );

    //si el objeto no entra en un subnodo, debe ir aquí
    if( index === -1 ) {

      return this;

      //si entra en un subnodo, continua con la búsqueda más profunda ahí
    } else {
      var node = this.nodes[index].getObjectNode( obj );
      if( node ) return node;
    }
  }

  return false;
};


/*
	 * Elimina un objeto específico del quadtree
	 * No elimina subnodos vacíos. Ver cleanup-function (función de limpieza)
	 */
Quadtree.prototype.removeObject = function( obj ) {

  var node = this.getObjectNode( obj ),
      index = node.objects.indexOf( obj );

  if( index === -1 ) return false;

  node.objects.splice( index, 1);
};


/*
	 * Limpiar el quadtree y eliminar todos los objetos
	 */
Quadtree.prototype.clear = function() {

  this.objects = [];

  if( !this.nodes.length ) return;

  for( var i=0; i < this.nodes.length; i=i+1 ) {

    this.nodes[i].clear();
  }

  this.nodes = [];
};


/*
	 * Limpiar el quadtree
	 * Como despejar, pero los objetos no serán eliminados, sino reinsertados
	 */
Quadtree.prototype.cleanup = function() {

  var objects = this.getAll();

  this.clear();

  for( var i=0; i < objects.length; i++ ) {
    this.insert( objects[i] );
  }
};



function updateTree() {
  if(this.quadTree.active)
  {
    this.quadTree.updateBounds();
    this.quadTree.cleanup();
  }
}

//entrada del teclado
p5.prototype.registerMethod('pre', p5.prototype.readPresses);

//actualización automática de sprite
p5.prototype.registerMethod('pre', p5.prototype.updateSprites);

//actualización de quadtree 
p5.prototype.registerMethod('post', updateTree);

//push y pop de la cámara
p5.prototype.registerMethod('pre', cameraPush);
p5.prototype.registerMethod('post', cameraPop);

p5.prototype.registerPreloadMethod('loadImageElement', p5.prototype);

//deltaTime
//p5.prototype.registerMethod('pre', updateDelta);

/**
 * Registra un mensaje de aviso a la consola host, utilizando el comando nativo `console.warn`
 * si está disponible pero se apoya en `console.log` si no.  Si ninguna
 * consola está disponible, este método fallará en silencio.
 * @method _warn
 * @param {!string} mensaje
 * @private - privado
 */
p5.prototype._warn = function(message) {
  var console = window.console;

  if(console)
  {
    if('function' === typeof console.warn)
    {
      console.warn(message);
    }
    else if('function' === typeof console.log)
    {
      console.log('Warning: ' + message);
    }
  }
};

  /**
   * Clase Base de la Forma de Colisión
   *
   * Tenemos un conjunto de formas de colisión disponibles que se ajustan a
   * una simple interfaz para que puedan revisarse entre sí
   * utilizando el Separating Axis Theorem (Teorema del Eje de Separación).
   *
   * Esta clase base implementa todos los métodos requeridos para una forma
   * de colisión y puede usarse como punto de colisión sin cambios.
   * Oreas formas deben heredarlo de esto y sobreescribir la mayoría de los métodos.
   *
   * @class p5.CollisionShape
   * @constructor - constructor 
   * @param {p5.Vector} [center] (cero si se omite)
   * @param {number} [rotation] (cero si se omite)
   */
  p5.CollisionShape = function(center, rotation) {
    /**
     * La transformación de esta forma relativa con su padre.  Si no hay padre,
     * esto es básicamente la transformación del espacio mundo.
     * Esto debe permanecer consistente con las propiedades _offset (desplazamiento), _rotation (rotación) y _scale (escala).
     * @property _localTransform
     * @type {p5.Transform2D}
     * @protected - protegido
     */
    this._localTransform = new p5.Transform2D();
    if (rotation) {
      this._localTransform.rotate(rotation);
    }
    if (center) {
      this._localTransform.translate(center);
    }

    /**
     * Transformación de cualquier objeto padre (probablemente un sprite) al que está
     * asociada esta forma.  Si es un forma de libre flotación, la transformación del padre
     * permanecerá como matriz de identidad.
     * @property _parentTransform
     * @type {p5.Transform2D}
     * @protected - protegido 
     */
    this._parentTransform = new p5.Transform2D();

    /**
     * El centro de la forma de colisión en espacio mundo.
     * @property _center
     * @private - privado
     * @type {p5.Vector}
     */
    this._center = new p5.Vector();

    /**
     * El centro de la forma de colisión en espacio local; también, el desplazamiento del
     * centro de la forma de colisión del centro del sprite de su padre.
     * @property _offset
     * @type {p5.Vector}
     * @private - privado 
     */
    this._offset = new p5.Vector();

    /**
     * La rotación en radianes en espacio local (relativo al padre).
     * Ten en cuenta que esto solo tendrá sentido para las formas que pueden rotar,
     * e.j. Cajas Delimitantes Orientadas
     * @property _rotation
     * @private - privado 
     * @type {number}
     */
    this._rotation = 0;

    /**
     * Escala X y Y en espacio local.  Ten en cuenta qu esto solo tendrá sentido
     * para formas que tienen dimensiones (e.j. no para colisionadores de punto)
     * @property _scale
     * @type {p5.Vector}
     * @private - privado 
     */
    this._scale = new p5.Vector(1, 1);

    /**
     * Si es verdadero, cuando llama `updateFromSprite` este colisionador adaptará las
     * dimensiones base del sprite además de adoptar su transformación.
     * Si es falso, solo la transformación (posición/rotación/escale) se adoptarán.
     * @property getsDimensionsFromSprite
     * @type {boolean}
     */
    this.getsDimensionsFromSprite = false;

    // Public getters/setters
    Object.defineProperties(this, {

      /**
       * El centro de la forma de colisión en el espacio-mundo.
       * Nota: puedes establecer esta propiedad con el valor en espacio-mundo, pero 
       * de hecho modificará la transformación local de la forma de colisión.
       * @property center - centro
       * @type {p5.Vector}
       */
      'center': {
        enumerable: true,
        get: function() {
          return this._center.copy();
        }.bind(this),
        set: function(c) {
          this._localTransform
            .translate(p5.Vector.mult(this._center, -1))
            .translate(c);
          this._onTransformChanged();
        }.bind(this)
      },

      /**
       * El centro de la forma de colisión en espacio local - si este colisionador pertenece
       * a un sprite, el desplazamiento del centro del colisionador del centro del sprite.
       * @property offset - compensar
       * @type {p5.Vector}
       */
      'offset': {
        enumerable: true,
        get: function() {
          return this._offset.copy();
        }.bind(this),
        set: function(o) {
          this._localTransform
            .translate(p5.Vector.mult(this._offset, -1))
            .translate(o);
          this._onTransformChanged();
        }.bind(this)
      },

      /**
       * La rotación espacio local del colisionador, en radianes.
       * @property rotation - rotación
       * @type {number}
       */
      'rotation': {
        enumerable: true,
        get: function() {
          return this._rotation;
        }.bind(this),
        set: function(r) {
          this._localTransform
            .clear()
            .scale(this._scale)
            .rotate(r)
            .translate(this._offset);
          this._onTransformChanged();
        }.bind(this)
      },

      /**
       * La escala del espacio local del colisionador
       * @property scale - escala
       * @type {p5.Vector}
       */
      'scale': {
        enumerable: true,
        get: function() {
          return this._scale.copy();
        }.bind(this),
        set: function(s) {
          this._localTransform
            .clear()
            .scale(s)
            .rotate(this._rotation)
            .translate(this._offset);
          this._onTransformChanged();
        }.bind(this)
      }
    });

    this._onTransformChanged();
  };

  /**
   * Actualiza el colisionador basado en las propiedad del sprite padre.
   * Las clases descendentes deberían sobreescribir este método para adoptar las dimensiones
   * del sprite si `getsDimensionsFromSprite` es verdadero.
   * @method updateFromSprite
   * @param {Sprite} sprite
   * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
   */
  p5.CollisionShape.prototype.updateFromSprite = function(sprite) {
    this.setParentTransform(sprite);
  };

  /**
   * Actualiza la transformación padre de este colisionador, que en turnos ajustará su
   * posición, rotación y escale en espacio mundo y recalcula los valores en caché
   * si es necesario.
   * Si un sprite se pasa como el 'padre' entonces se calculará una nueva transformación
   * de la posición/rotación/escale y utilización del sprite.
   * @method setParentTransform
   * @param {p5.Transform2D|Sprite} parent - padre
   */
  p5.CollisionShape.prototype.setParentTransform = function(parent) {
    if (parent instanceof Sprite) {
      this._parentTransform
        .clear()
        .scale(parent._getScaleX(), parent._getScaleY())
        .rotate(radians(parent.rotation))
        .translate(parent.position);
    } else if (parent instanceof p5.Transform2D) {
      this._parentTransform = parent.copy();
    } else {
      throw new TypeError('Mal argumento para setParentTransform: ' + parent);
    }
    this._onTransformChanged();
  };

  /**
   * Recalcula las propiedades en caché, vectores relevantes, etc. cuando al menos uno
   * cambia la transformación de la forma.  La base de CollisionShape (y PointCollider)
   * solo necesita recalcular la forma del centro, pero otras formas pueden necesitar 
   * sobreescribir este método y hacer recálculo adicional.
   * @method _onTransformChanged
   * @protected
   */
  p5.CollisionShape.prototype._onTransformChanged = function() {
    // Recalcula las propiedades internas de las transformaciones

    // Rotación en espacio local
    this._rotation = this._localTransform.getRotation();

    // Escala en espacio local
    this._scale = this._localTransform.getScale();

    // Desplazamiento en espacio local
    this._offset
      .set(0, 0)
      .transform(this._localTransform);

    // Centro en el espacio-mundo
    this._center
      .set(this._offset.x, this._offset.y)
      .transform(this._parentTransform);
  };

  /**
   * Calcula los más pequeños movimientos que se necesitan para mover esta forma de colisión fuera
   * otra forma de colisión. Si las formas no se sobreponen, regresa a
   * vector cero para indicar que el desplazamiento no es necesario.
   * @method collide - colisiona 
   * @param {p5.CollisionShape} other - otro
   * @return {p5.Vector}
   */
  p5.CollisionShape.prototype.collide = function(other) {
    var displacee = this, displacer = other;

    // Calcula un vector de desplazamiento utilizando el Teorema del Eje de Separación
    // (Válido solo para formas convexas)
    //
    // Si una línea (eje) existe en las que las proyecciones ortogonales de las dos formas
    // no se sobreponen, entonces las formas no se sobreponen.  Si las proyecciones de las
    // formas no se sobreponen en todos los ejes candidatos, el eje que tenía una pequeña
    // sobreposición nos da el menor desplazamiento posible.
    //
    // @see http://www.dyn4j.org/2010/01/sat/
    var smallestOverlap = Infinity;
    var smallestOverlapAxis = null;

    // Aceleramos las cosas con una suposición adicional que todas las formas
    // de colisión son centrosimétricas: Circulos, elipses, y rectángulos
    // están bien.  Esto nos deja solo comparar el radio de las formas con la
    // distancia entre sus centros, incluso para formas no circulares.
    // Otros formas convexas, (triángulos, pentágonos) requerirán uso más
    // complejo de las posiciones de sus proyecciones en el eje.
    var deltaOfCenters = p5.Vector.sub(displacer.center, displacee.center);

    // Resulta que solo necesitamos verificar un par de ejes, definidos por las formas
    // que se revisan.  Para un polígono, la normal de cada cara es un posible
    // eje de separación.
    var candidateAxes = p5.CollisionShape._getCandidateAxesForShapes(displacee, displacer);
    var axis, deltaOfCentersOnAxis, distanceOfCentersOnAxis;
    for (var i = 0; i < candidateAxes.length; i++) {
      axis = candidateAxes[i];

      // Si la distancia entre los centros de las formas como proyectado en el
      // eje de separación es más grande qye la combinación de radios de las formas
      // proyectadas en el eje,  las formas no se sobreponen en este eje.
      deltaOfCentersOnAxis = p5.Vector.project(deltaOfCenters, axis);
      distanceOfCentersOnAxis = deltaOfCentersOnAxis.mag();
      var r1 = displacee._getRadiusOnAxis(axis);
      var r2 = displacer._getRadiusOnAxis(axis);
      var overlap = r1 + r2 - distanceOfCentersOnAxis;
      if (overlap <= 0) {
        // Estas formas están separadas con este eje.
        // Salida anticipada, regresando al desplazamiento de vector cero.
        return new p5.Vector();
      } else if (overlap < smallestOverlap) {
        // Este es la sobreposición más pequeña que hemos encontrado hasta ahorar - almacena 
        // información sobre ello, que podemos utilizar para dar el menor
        // desplazamiento cuando terminemos.
        smallestOverlap = overlap;
        // Normalmente utilizamos el delta de los centros, que nos da la direción
        // junto con un eje.  En el raro caso que los centros se sobrepongan exactamente,
        // solo utiliza el eje original
        if (deltaOfCentersOnAxis.x === 0 && deltaOfCentersOnAxis.y === 0) {
          smallestOverlapAxis = axis;
        } else {
          smallestOverlapAxis = deltaOfCentersOnAxis;
        }
      }
    }

    // Si lo hacemos aquí, sobreponemos en todos los posibles ejes y
    // podemos calcular el vector más pequeño que desplazará este fuera de otro.
    return smallestOverlapAxis.copy().setMag(-smallestOverlap);
  };


  /**
   * Comprueba si esta forma se superpone a otra.
   * @method overlap - sobreponer
   * @param {p5.CollisionShape} other - otro
   * @return {boolean}
   */
  p5.CollisionShape.prototype.overlap = function(other) {
    var displacement = this.collide(other);
    return displacement.x !== 0 || displacement.y !== 0;
  };

  /**
   * @method _getCanididateAxesForShapes
   * @private - privado
   * @static - estático
   * @param {p5.CollisionShape} shape1
   * @param {p5.CollisionShape} shape2
   * @return {Array.<p5.Vector>}
   */
  p5.CollisionShape._getCandidateAxesForShapes = function(shape1, shape2) {
    var axes = shape1._getCandidateAxes(shape2)
      .concat(shape2._getCandidateAxes(shape1))
      .map(function(axis) {
        if (axis.x === 0 && axis.y === 0) {
          return p5.CollisionShape.X_AXIS;
        }
        return axis;
      });
    return deduplicateParallelVectors(axes);
  };

  /*
   * Reduce un array de vectores a un conjunto de ejes únicos (que es, dos vectores
   * en el array no deberían ser paralelos).
   * @param {Array.<p5.Vector>} array - matriz
   * @return {Array}
   */
  function deduplicateParallelVectors(array) {
    return array.filter(function(item, itemPos) {
      return !array.some(function(other, otherPos) {
        return itemPos < otherPos && item.isParallel(other);
      });
    });
  }

  /**
   * Calcula los ejes de separación candidatos en relación con otro objeto.
   * Sobreescribe este método en las subclases para implimentar un comportamiento de colisión.
   * @method _getCandidateAxes
   * @protected - protegido
   * @return {Array.<p5.Vector>}
   */
  p5.CollisionShape.prototype._getCandidateAxes = function() {
    return [];
  };

  /**
   * Obten el radio de esta forma (la mitad del ancho de su proyección) a lo largo del eje dado.
   * Sobreescribe este método en las subclases para implimentar un comportamiento de colisión.
   * @method _getRadiusOnAxis
   * @protected - potegido
   * @param {p5.Vector} axis - eje
   * @return {number}
   */
  p5.CollisionShape.prototype._getRadiusOnAxis = function() {
    return 0;
  };

  /**
   * Obtenga el radio mínimo de la forma en cualquier eje para controles de túneles.
   * @method _getMinRadius
   * @protected - protegido
   * @param {p5.Vector} axis - eje
   * @return {number}
   */
  p5.CollisionShape.prototype._getMinRadius = function() {
    return 0;
  };

  /**
   * @property X_AXIS
   * @type {p5.Vector}
   * @static - estático
   * @final - final
   */
  p5.CollisionShape.X_AXIS = new p5.Vector(1, 0);

  /**
   * @property Y_AXIS
   * @type {p5.Vector}
   * @static - estático
   * @final - final
   */
  p5.CollisionShape.Y_AXIS = new p5.Vector(0, 1);

  /**
   * @property WORLD_AXES
   * @type {Array.<p5.Vector>}
   * @static - estático
   * @final - final
   */
  p5.CollisionShape.WORLD_AXES = [
    p5.CollisionShape.X_AXIS,
    p5.CollisionShape.Y_AXIS
  ];

  /**
   * Obtén la información de los límites alineados con el eje del espacio mundo para esta forma de colisión.
   * Utilizado principalmente para quadtree.
   * @method getBoundingBox
   * @return {{top: number, bottom: number, left: number, right: number, width: number, height: number}}
   */
  p5.CollisionShape.prototype.getBoundingBox = function() {
    var radiusOnX = this._getRadiusOnAxis(p5.CollisionShape.X_AXIS);
    var radiusOnY = this._getRadiusOnAxis(p5.CollisionShape.Y_AXIS);
    return {
      top: this.center.y - radiusOnY,
      bottom: this.center.y + radiusOnY,
      left: this.center.x - radiusOnX,
      right: this.center.x + radiusOnX,
      width: radiusOnX * 2,
      height: radiusOnY * 2
    };
  };

  /**
   * Una forma de colisión de punto, utilizado para detectar sobreposición y desplazamiento de vectores
   * en comparación con otras formas de colisión.
   * @class p5.PointCollider
   * @constructor - constructor
   * @extends p5.CollisionShape
   * @param {p5.Vector} center - centro
   */
  p5.PointCollider = function(center) {
    p5.CollisionShape.call(this, center);
  };
  p5.PointCollider.prototype = Object.create(p5.CollisionShape.prototype);

  /**
   * Construye un nuevo PointCollider con el desplazamiento dado para el sprite dado.
   * @method createFromSprite
   * @static - estático
   * @param {Sprite} sprite
   * @param {p5.Vector} [offset] desde el centro del sprite
   * @return {p5.PointCollider}
   */
  p5.PointCollider.createFromSprite = function(sprite, offset) {
    // Crea la forma de colisión en el desplazamiento transformado
    var shape = new p5.PointCollider(offset);
    shape.setParentTransform(sprite);
    return shape;
  };

  /**
   * Depurar-dibujar este colisionador de puntos
   * @method draw - dibujar
   * @param {p5} instancia sketch que se utilizará para dibujar
   */
  p5.PointCollider.prototype.draw = function(sketch) {
    sketch.push();
    sketch.rectMode(sketch.CENTER);
    sketch.translate(this.center.x, this.center.y);
    sketch.noStroke();
    sketch.fill(0, 255, 0);
    sketch.ellipse(0, 0, 2, 2);
    sketch.pop();
  };

  /**
   * Una forma de colisión circular, utilizada para detectar sobreposición y desplazamiento de vectores
   * con otras formas de colisión.
   * @class p5.CircleCollider
   * @constructor - constructor
   * @extends p5.CollisionShape
   * @param {p5.Vector} center - centro
   * @param {number} radius - radio
   */
  p5.CircleCollider = function(center, radius) {
    p5.CollisionShape.call(this, center);

    /**
     * El radio sin escalar del colisionador circular.
     * @property radius - radio
     * @type {number}
     */
    this.radius = radius;

    /**
     *El radio final de este círculo después de haber sido escalado por transformaciones principales y locales,
     * almacenado en caché para que no lo recalculemos todo el tiempo.
     * @property _scaledRadius
     * @type {number}
     * @private - privado
     */
    this._scaledRadius = 0;

    this._computeScaledRadius();
  };
  p5.CircleCollider.prototype = Object.create(p5.CollisionShape.prototype);

  /**
   * Construye un nuevo CircleCollider con el desplazamiento dado para el sprite dado.
   * @method createFromSprite
   * @static - estático 
   * @param {Sprite} sprite
   * @param {p5.Vector} [offset] desde el centro del sprite
   * @param {number} [radius]
   * @return {p5.CircleCollider}
   */
  p5.CircleCollider.createFromSprite = function(sprite, offset, radius) {
    var customSize = typeof radius === 'number';
    var shape = new p5.CircleCollider(
      offset,
      customSize ? radius : 1
    );
    shape.getsDimensionsFromSprite = !customSize;
    shape.updateFromSprite(sprite);
    return shape;
  };

  /**
   * Actualiza este colisionador basado en  las propiedades de un sprite padre.
   * @method updateFromSprite
   * @param {Sprite} sprite
   * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
   */
  p5.CircleCollider.prototype.updateFromSprite = function(sprite) {
    if (this.getsDimensionsFromSprite) {
      if (sprite.animation) {
        this.radius = Math.max(sprite.animation.getWidth(), sprite.animation.getHeight())/2;
      } else {
        this.radius = Math.max(sprite.width, sprite.height)/2;
      }
    }
    this.setParentTransform(sprite);
  };

  /**
   * Recalcula las propiedades caché, vectores relevantes, etc. cuando  cambia al menos una
   * de las transformaciones de la forma.  La base CollisionShape (y PointCollider)
   * solo necesita recalcular el centro de la forma, pero otras formas pueden necesitar
   * sobreescribir este método y hacer recálculos adicionales.
   * @method _onTransformChanged
   * @protected - protegido
   */
  p5.CircleCollider.prototype._onTransformChanged = function() {
    p5.CollisionShape.prototype._onTransformChanged.call(this);
    this._computeScaledRadius();
  };

  /**
   * Llama para actualizar el valor del radio escalado en caché.
   * @method _computeScaledRadius
   * @private - privado 
   */
  p5.CircleCollider.prototype._computeScaledRadius = function() {
    this._scaledRadius = new p5.Vector(this.radius, 0)
      .transform(this._localTransform)
      .transform(this._parentTransform)
      .sub(this.center)
      .mag();
  };

  /**
   * Depurar dibujar esta forma de colisión.
   * @method draw - dibujar
   * @param {p5} instancia sketch que se utilizará para dibujar
   */
  p5.CircleCollider.prototype.draw = function(sketch) {
    sketch.push();
    sketch.noFill();
    sketch.stroke(0, 255, 0);
    sketch.rectMode(sketch.CENTER);
    sketch.ellipse(this.center.x, this.center.y, this._scaledRadius*2, this._scaledRadius*2);
    sketch.pop();
  };

    /**
   * Sobreescribe CollisionShape.setParentTransform
   * Actualiza la transformación padre de este colisionador, que ajustará en orden su
   * posición, rotación y escale en espacio mundo y recalcula los valores caché
   * si es necesario.
   * Si un Sprite se pasa como el 'padre' entonces se calculará una nueva transformación
   * de la posición/rotación/escala y utilización del sprite.
   * Utiliza el máximo de los valores de las escalas x y y para que el círculo incluya el sprite.
   * @method setParentTransform
   * @param {p5.Transform2D|Sprite} parent - padre
   */
  p5.CircleCollider.prototype.setParentTransform = function(parent) {
    if (parent instanceof Sprite) {
      this._parentTransform
        .clear()
        .scale(Math.max(parent._getScaleX(), parent._getScaleY()))
        .rotate(radians(parent.rotation))
        .translate(parent.position);
    } else if (parent instanceof p5.Transform2D) {
      this._parentTransform = parent.copy();
    } else {
      throw new TypeError('Bad argument to setParentTransform: ' + parent);
    }
    this._onTransformChanged();
  };

  /**
   * Calcular el eje de separación candidato con relación a otro objeto.
   * @method _getCandidateAxes
   * @protected - protegido 
   * @param {p5.CollisionShape} other - otro
   * @return {Array.<p5.Vector>}
   */
  p5.CircleCollider.prototype._getCandidateAxes = function(other) {
    // Un círculo tiene un potencial infinito de ejes candidatos, así que los que escojamos 
    // dependen de contra qué lo estamos colisionando.

    // TODO: Si podemos pedir otra forma de la lista de vertices, entonces podemos
    //       generalizar este algoritmo utilizando siempre el más cercano, y
    //       eliminar el conocimiento especial de OBB y AABB.

    if (other instanceof p5.OrientedBoundingBoxCollider || other instanceof p5.AxisAlignedBoundingBoxCollider) {
      // Hay cuatro posibles ejes de separación con una caja - uno por cada
      // uno de sus vertices, a tráves del centro del círculo
      // necesitamos el más cercano.
      var smallestSquareDistance = Infinity;
      var axisToClosestVertex = null;

      // Genera el grupo de vertices para otra forma
      var halfDiagonals = other.halfDiagonals;
      [
        p5.Vector.add(other.center, halfDiagonals[0]),
        p5.Vector.add(other.center, halfDiagonals[1]),
        p5.Vector.sub(other.center, halfDiagonals[0]),
        p5.Vector.sub(other.center, halfDiagonals[1])
      ].map(function(vertex) {
        // Transforma cada vértice en un vector desde este centro del colisionador para
        // ese vértice, que define un eje que podríamos querer comprobar.
        return vertex.sub(this.center);
      }.bind(this)).forEach(function(vector) {
        // Averigua qué vértice está más cerca y usa su eje
        var squareDistance = vector.magSq();
        if (squareDistance < smallestSquareDistance) {
          smallestSquareDistance = squareDistance;
          axisToClosestVertex = vector;
        }
      });
      return [axisToClosestVertex];
    }

    // Cuando revisamos contra otro círculo o un punto solo necesitamos revisar el
    // eje a través de ambos centros de las figuras.
    return [p5.Vector.sub(other.center, this.center)];
  };

  /**
   * Obtén el radio de esta forma (mitad del ancho de su proyección) junto con el eje dado.
   * @method _getRadiusOnAxis
   * @protected - protegido 
   * @return {number}
   */
  p5.CircleCollider.prototype._getRadiusOnAxis = function() {
    return this._scaledRadius;
  };

  /**
   * Obtén el radio minimo de la forma en cualquier eje para revisión de tunelización.
   * @method _getMinRadius
   * @protected - protegido
   * @param {p5.Vector} axis - eje
   * @return {number}
   */
  p5.CircleCollider.prototype._getMinRadius = function() {
    return this._scaledRadius;
  };

  /**
   * Una forma de colisión de Caja delimitante alineada con el eje (AABB) , se utiliza para detectar sobreposición
   * y calcular los vectores de desplazamiento mínimo con otras formas de colisión.
   *
   * No puede rotarse - por eso el nombre.  Puedes utilizar en este lugar un 
   * OBB porque simplifica algunos cálculos y puede mejorar su rendimiento.
   *
   * @class p5.AxisAlignedBoundingBoxCollider
   * @constructor
   * @extends p5.CollisionShape
   * @param {p5.Vector} center
   * @param {number} width - ancho
   * @param {number} height - altura
   */
  p5.AxisAlignedBoundingBoxCollider = function(center, width, height) {
    p5.CollisionShape.call(this, center);

    /**
     * Ancho de caja sin escala.
     * @property _width
     * @private - privado 
     * @type {number}
     */
    this._width = width;

    /**
     * Altura de la caja sin escalar.
     * @property _width
     * @private - privado
     * @type {number}
     */
    this._height = height;

    /**
     * Semidiagobal en caché, utilizado para calcular el radio proyectado.
     * Ya transformado en espacio mundo.
     * @property _halfDiagonals
     * @private
     * @type {Array.<p5.Vector>}
     */
    this._halfDiagonals = [];

    Object.defineProperties(this, {

      /**
       * El ancho sin transformar de la caja colisionadora.
       * Recalcula las diagonales cuando se establezca.
       * @property width - ancho
       * @type {number}
       */
      'width': {
        enumerable: true,
        get: function() {
          return this._width;
        }.bind(this),
        set: function(w) {
          this._width = w;
          this._halfDiagonals = this._computeHalfDiagonals();
        }.bind(this)
      },

      /**
       * La altura sin rotar de la caja colisionadora.
       * Recalcula las diagonales cuando se establezca.
       * @property height
       * @type {number}
       */
      'height': {
        enumerable: true,
        get: function() {
          return this._height;
        }.bind(this),
        set: function(h) {
          this._height = h;
          this._halfDiagonals = this._computeHalfDiagonals();
        }.bind(this)
      },

      /**
       * Dos vectores que representan los semidiagonales de la caja en sus
       * dimensiones y orientación actual.
       * @property halfDiagonals
       * @readOnly
       * @type {Array.<p5.Vector>}
       */
      'halfDiagonals': {
        enumerable: true,
        get: function() {
          return this._halfDiagonals;
        }.bind(this)
      }
    });

    this._computeHalfDiagonals();
  };
  p5.AxisAlignedBoundingBoxCollider.prototype = Object.create(p5.CollisionShape.prototype);

  /**
   * Construya un nuevo AxisAlignedBoundingBoxCollider con un desplazamiento dado para el sprite dado.
   * @method createFromSprite
   * @static
   * @param {Sprite} sprite
   * @param {p5.Vector} [offset] desde el centro del sprite
   * @return {p5.CircleCollider}
   */
  p5.AxisAlignedBoundingBoxCollider.createFromSprite = function(sprite, offset, width, height) {
    var customSize = typeof width === 'number' && typeof height === 'number';
    var box = new p5.AxisAlignedBoundingBoxCollider(
      offset,
      customSize ? width : 1,
      customSize ? height : 1
    );
    box.getsDimensionsFromSprite = !customSize;
    box.updateFromSprite(sprite);
    return box;
  };

  /**
   * Actualice este colisionador según las propiedades de un Sprite padre.
   * @method updateFromSprite
   * @param {Sprite} sprite
   * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
   */
  p5.AxisAlignedBoundingBoxCollider.prototype.updateFromSprite = function(sprite) {
    if (this.getsDimensionsFromSprite) {
      if (sprite.animation) {
        this._width = sprite.animation.getWidth();
        this._height = sprite.animation.getHeight();
      } else {
        this._width = sprite.width;
        this._height = sprite.height;
      }
    }
    this.setParentTransform(sprite);
  };

  /**
   * Recalcula las propiedad en caché, vectores relevantes, etc. cuando cambia al menos
   * una de las transformaciones de la forma.  La base CollisionShape (y PointCollider)
   * solo necesita recalcular el centro de la forma, pero otras formas pueden necesitar
   * sobreescribir este método y hacer recálculos adicionales.
   * @method _onTransformChanged
   * @protected
   */
  p5.AxisAlignedBoundingBoxCollider.prototype._onTransformChanged = function() {
    p5.CollisionShape.prototype._onTransformChanged.call(this);
    this._computeHalfDiagonals();
  };

  /**
   * Vuelva a calcular los vectores de la mitad de la diagonal de este cuadro delimitador.
   * @method _computeHalfDiagonals
   * @private
   * @return {Array.<p5.Vector>}
   */
  p5.AxisAlignedBoundingBoxCollider.prototype._computeHalfDiagonals = function() {
    // Transformamos el rectángulo (que puede escalar y rotarlo) después calculamos
    // una axis-aligned bounding box _around_ it (caja delimitante con el eje a su alrededor).
    var composedTransform = p5.Transform2D.mult(this._parentTransform, this._localTransform);
    var transformedDiagonals = [
      new p5.Vector(this._width / 2, -this._height / 2),
      new p5.Vector(this._width / 2, this._height / 2),
      new p5.Vector(-this._width / 2, this._height / 2)
    ].map(function(vertex) {
      return vertex.transform(composedTransform).sub(this.center);
    }.bind(this));

    var halfWidth = Math.max(
      Math.abs(transformedDiagonals[0].x),
      Math.abs(transformedDiagonals[1].x)
    );
    var halfHeight = Math.max(
      Math.abs(transformedDiagonals[1].y),
      Math.abs(transformedDiagonals[2].y)
    );

    this._halfDiagonals = [
      new p5.Vector(halfWidth, -halfHeight),
      new p5.Vector(halfWidth, halfHeight)
    ];
  };

  /**
   * Depurar-dibujar este colisionador.
   * @method draw
   * @param {p5} sketch - instancia p5 para usar para dibujar
   */
  p5.AxisAlignedBoundingBoxCollider.prototype.draw = function(sketch) {
    sketch.push();
    sketch.rectMode(sketch.CENTER);
    sketch.translate(this.center.x, this.center.y);
    sketch.noFill();
    sketch.stroke(0, 255, 0);
    sketch.strokeWeight(1);
    sketch.rect(0, 0, Math.abs(this._halfDiagonals[0].x) * 2, Math.abs(this._halfDiagonals[0].y) * 2);
    sketch.pop();
  };

  /**
   * Calcule los ejes de separación candidatos en relación con otro objeto
   * @method _getCandidateAxes
   * @protected
   * @return {Array.<p5.Vector>}
   */
  p5.AxisAlignedBoundingBoxCollider.prototype._getCandidateAxes = function() {
    return p5.CollisionShape.WORLD_AXES;
  };

  /**
   * Obtenga el radio de esta forma (la mitad del ancho de su proyección) a lo largo del eje dado.
   * @method _getRadiusOnAxis
   * @protected
   * @param {p5.Vector} axis - eje
   * @return {number}
   */
  p5.AxisAlignedBoundingBoxCollider.prototype._getRadiusOnAxis = function(axis) {
    // Como proyectar un rectángulo en un eje:
    // Proyecta los vectores con esquinas en el centro para dos esquinas adyacentes (caché aquí)
    // en el eje.  La magnitud más grande de los dos es el radio de tu proyección.
    return Math.max(
      p5.Vector.project(this._halfDiagonals[0], axis).mag(),
      p5.Vector.project(this._halfDiagonals[1], axis).mag());
  };

  /**
   * Obtén el radio mínimo de la forma en cualquier eje para revisión de tunelización.
   * @method _getMinRadius
   * @protected
   * @param {p5.Vector} axis
   * @return {number}
   */
  p5.AxisAlignedBoundingBoxCollider.prototype._getMinRadius = function() {
    return Math.min(this._width, this._height);
  };

  /**
   * Una forma de colisión Oriented Bounding Box (OBB) (Cuadro Delimitante Orientado), se utiliza para detectar sobreposición y
   * calcula los vectores de desplazamiento mínimo con otras formas de colisión.
   * @class p5.OrientedBoundingBoxCollider
   * @constructor
   * @extends p5.CollisionShape
   * @param {p5.Vector} centro del rectángulo en el espacio-mundo
   * @param {number} ancho del rectángulo (cuando no se gira) 
   * @param {number} altura del rectángulo (cuando no se gira)
   * @param {number} rotación alrededor del centro, en radianes
   */
  p5.OrientedBoundingBoxCollider = function(center, width, height, rotation) {
    p5.CollisionShape.call(this, center, rotation);

    /**
     * Ancho de la caja sin escalar.
     * @property _width - ancho
     * @private
     * @type {number}
     */
    this._width = width;

    /**
     * Altura de la caja sin escalar.
     * @property _width
     * @private
     * @type {number}
     */
    this._height = height;

    /**
     * Ejes de separación en caché, esta forma contribuye a una colisión.
     * @property _potentialAxes
     * @private
     * @type {Array.<p5.Vector>}
     */
    this._potentialAxes = [];

    /**
     * Medias diagonales almacenadas en caché, utilizadas para calcular un radio proyectado.
     *  Ya transformado en espacio-mundo.
     * @property _halfDiagonals
     * @private
     * @type {Array.<p5.Vector>}
     */
    this._halfDiagonals = [];

    Object.defineProperties(this, {

      /**
       * La altura sin girar del colisionador de cajas.                                  
       * Vuelve a calcular las diagonales cuando se establece.
       * @property width - ancho
       * @type {number}
       */
      'width': {
        enumerable: true,
        get: function() {
          return this._width;
        }.bind(this),
        set: function(w) {
          this._width = w;
          this._onTransformChanged();
        }.bind(this)
      },

      /**
       * La altura sin girar del colisionador de cajas.
       * Vuelve a calcular las diagonales cuando se establece.
       * @property height - altura
       * @type {number}
       */
      'height': {
        enumerable: true,
        get: function() {
          return this._height;
        }.bind(this),
        set: function(h) {
          this._height = h;
          this._onTransformChanged();
        }.bind(this)
      },

      /**
       * Dos vectores que representan semidiagonales adyacentes de la caja en sus
       * dimensiones y orientaciones actuales.
       * @property halfDiagonals
       * @readOnly
       * @type {Array.<p5.Vector>}
       */
      'halfDiagonals': {
        enumerable: true,
        get: function() {
          return this._halfDiagonals;
        }.bind(this)
      }
    });

    this._onTransformChanged();
  };
  p5.OrientedBoundingBoxCollider.prototype = Object.create(p5.CollisionShape.prototype);

  /**
   * Construya un nuevo AxisAlignedBoundingBoxCollider con un desplazamiento dado para el sprite dado.
   * @method createFromSprite
   * @static
   * @param {Sprite} sprite
   * @param {p5.Vector} [offset] desde el centro del sprite
   * @param {number} [width]
   * @param {number} [height]
   * @param {number} [rotation] en radianes
   * @return {p5.CircleCollider}
   */
  p5.OrientedBoundingBoxCollider.createFromSprite = function(sprite, offset, width, height, rotation) {
    var customSize = typeof width === 'number' && typeof height === 'number';
    var box = new p5.OrientedBoundingBoxCollider(
      offset,
      customSize ? width : 1,
      customSize ? height : 1,
      rotation
    );
    box.getsDimensionsFromSprite = !customSize;
    box.updateFromSprite(sprite);
    return box;
  };

  /**
   * Actualiza este colisionador según las propiedades de un Sprite padre.
   * @method updateFromSprite
   * @param {Sprite} sprite
   * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
   */
  p5.OrientedBoundingBoxCollider.prototype.updateFromSprite =
    p5.AxisAlignedBoundingBoxCollider.prototype.updateFromSprite;

  /**
   * Suponiendo que este colisionador es un colisionador barrido de un sprite, actualícelo según
   * las propiedades del sprite padre para que encierre las propiedades actuales del sprite
   *  y su posición proyectada.
   * @method updateSweptColliderFromSprite
   * @param {Sprite} sprite
   */
  p5.OrientedBoundingBoxCollider.prototype.updateSweptColliderFromSprite = function(sprite) {
    var vMagnitude = sprite.velocity.mag();
    var vPerpendicular = new p5.Vector(sprite.velocity.y, -sprite.velocity.x);
    this._width = vMagnitude + 2 * sprite.collider._getRadiusOnAxis(sprite.velocity);
    this._height = 2 * sprite.collider._getRadiusOnAxis(vPerpendicular);
    var newRotation = radians(sprite.getDirection());
    var newCenter = new p5.Vector(
      sprite.newPosition.x + 0.5 * sprite.velocity.x,
      sprite.newPosition.y + 0.5 * sprite.velocity.y
    );
    // Perform this.rotation = newRotation y this.center = newCenter;
    this._localTransform
      .clear()
      .scale(this._scale)
      .rotate(newRotation)
      .translate(this._offset)
      .translate(p5.Vector.mult(this._center, -1))
      .translate(newCenter);
    this._onTransformChanged();
  };

  /**
   * Vuelva a calcular las propiedades almacenadas en caché, los vectores relevantes, etc. cuando al menos una
   * de las formas de las transformaciones cambie. La base CollisionShape (y PointCollider)
   * solo necesita volver a calcular el centro de la forma, pero es posible que otras formas necesiten
   * anular este método y realice un recálculo adicional.
   * @method _onTransformChanged
   * @protected
   */
  p5.OrientedBoundingBoxCollider.prototype._onTransformChanged = function() {
    p5.CollisionShape.prototype._onTransformChanged.call(this);

    // Transforma cada vértice por matrices locales y globales
    // después utiliza sus diferencias para determinar el width (ancho), height (alto), y halfDiagonals (semidiagonales)
    var composedTransform = p5.Transform2D.mult(this._parentTransform, this._localTransform);
    var transformedVertices = [
      new p5.Vector(this._width / 2, -this._height / 2),
      new p5.Vector(this._width / 2, this._height / 2),
      new p5.Vector(-this._width / 2, this._height / 2)
    ].map(function(vertex) {
      return vertex.transform(composedTransform);
    });

    this._halfDiagonals = [
      p5.Vector.sub(transformedVertices[0], this.center),
      p5.Vector.sub(transformedVertices[1], this.center)
    ];

    this._potentialAxes = [
      p5.Vector.sub(transformedVertices[1], transformedVertices[2]),
      p5.Vector.sub(transformedVertices[1], transformedVertices[0])
    ];
  };

  /**
   * Depurar-dibujar este colisionador.
   * @method draw
   * @param {p5} sketch - instancia p5 para usar para dibujar
   */
  p5.OrientedBoundingBoxCollider.prototype.draw = function(sketch) {
    var composedTransform = p5.Transform2D.mult(this._localTransform, this._parentTransform);
    var scale = composedTransform.getScale();
    var rotation = composedTransform.getRotation();
    sketch.push();
    sketch.translate(this.center.x, this.center.y);
    sketch.scale(scale.x, scale.y);
    if (sketch._angleMode === sketch.RADIANS) {
      sketch.rotate(rotation);
    } else {
      sketch.rotate(degrees(rotation));
    }

    sketch.noFill();
    sketch.stroke(0, 255, 0);
    sketch.strokeWeight(1);
    sketch.rectMode(sketch.CENTER);
    sketch.rect(0, 0, this._width, this._height);
    sketch.pop();
  };

  /**
   * Calcule los ejes de separación candidatos en relación con otro objeto.
   * @method _getCandidateAxes
   * @protected
   * @return {Array.<p5.Vector>}
   */
  p5.OrientedBoundingBoxCollider.prototype._getCandidateAxes = function() {
    // Una caja delimitante orientada siempre provee dos de sus caras normales,
    // que hemos calculado.
    return this._potentialAxes;
  };

  /**
   * Obtenga el radio de esta forma (la mitad del ancho de su proyección) a lo largo del eje dado.
   * @method _getRadiusOnAxis
   * @protected
   * @param {p5.Vector} eje
   * @return {number}
   */
  p5.OrientedBoundingBoxCollider.prototype._getRadiusOnAxis =
    p5.AxisAlignedBoundingBoxCollider.prototype._getRadiusOnAxis;
  // Podemos reutilizar la versión AABB de este método porque ambos proyectan
  // semidiagonales en caché - funciona el mismo código.

  /**
   * Al verificar la tunelización a través de OrientedBoundingBoxCollider, use un
   * peor caso de cero (por ejemplo, si el otro sprite pasa por una esquina).
   * @method _getMinRadius
   * @protected
   * @param {p5.Vector} eje
   * @return {number}
   */
  p5.OrientedBoundingBoxCollider.prototype._getMinRadius =
    p5.AxisAlignedBoundingBoxCollider.prototype._getMinRadius;

  /**
   * Una transformación afín 2D (traslación, rotación, escala) almacenada como
   * Matriz de 3x3 que utiliza coordenadas homogéneas. Se usa para transformar rápidamente
   * puntos o vectores entre marcos de referencia.
   * @class p5.Transform2D
   * @constructor
   * @extends Array - matriz
   * @param {p5.Transform2D|Array.<number>} [source] - fuente
   */
  p5.Transform2D = function(source) {
    // Solo almacenamos los primeros seis valores.
    // la última fila en una matriz de transformación 2D siempre es "0 0 1" para que podamos 
    // guardar espacio y acelerar ciertos cálculos con esta suposición.
    source = source || [1, 0, 0, 0, 1, 0];
    if (source.length !== 6) {
      throw new TypeError('Transform2D mdebe tener 6 componentes');
    }
    this.length = 6;
    this[0] = source[0];
    this[1] = source[1];
    this[2] = source[2];
    this[3] = source[3];
    this[4] = source[4];
    this[5] = source[5];
  };
  p5.Transform2D.prototype = Object.create(Array.prototype);

  /**
   * Restablezca esta transformación a una transformación de identidad, en el lugar.
   * @method clear - limpiar
   * @return {p5.Transform2D} esta transformación
   */
  p5.Transform2D.prototype.clear = function() {
    this[0] = 1;
    this[1] = 0;
    this[2] = 0;
    this[3] = 0;
    this[4] = 1;
    this[5] = 0;
    return this;
  };

  /**
   * Haz una copia de esta transformación.
   * @method copy - copia
   * @return {p5.Transform2D}
   */
  p5.Transform2D.prototype.copy = function() {
    return new p5.Transform2D(this);
  };

  /**
   * Revisa si dos transformaciones son lo mismo.
   * @method equals - iguales
   * @param {p5.Transform2D|Array.<number>} otro
   * @return {boolean} - booleano
   */
  p5.Transform2D.prototype.equals = function(other) {
    if (!(other instanceof p5.Transform2D || Array.isArray(other))) {
      return false; // Never equal to other types.
    }

    for (var i = 0; i < 6; i++) {
      if (this[i] !== other[i]) {
        return false;
      }
    }
    return true;
  };

  /**
   * Multiplica dos transformaciones juntas, combinándolas.
   * No modifica las transformaciones originales.  Assigna el resultado en un argumento dest si
   * se se provee y lo regresa.  Sino regresa a una nueva transformación.
   * @method mult
   * @static
   * @param {p5.Transform2D|Array.<number>} t1
   * @param {p5.Transform2D|Array.<number>} t2
   * @param {p5.Transform2D} [dest]
   * @return {p5.Transform2D}
   */
  p5.Transform2D.mult = function(t1, t2, dest) {
    dest = dest || new p5.Transform2D();

    // Captura los valores de las matrices originales en variables locales, en caso de que uno de
    // ellos sea el que estamos mutando.
    var t1_0, t1_1, t1_2, t1_3, t1_4, t1_5;
    t1_0 = t1[0];
    t1_1 = t1[1];
    t1_2 = t1[2];
    t1_3 = t1[3];
    t1_4 = t1[4];
    t1_5 = t1[5];

    var t2_0, t2_1, t2_2, t2_3, t2_4, t2_5;
    t2_0 = t2[0];
    t2_1 = t2[1];
    t2_2 = t2[2];
    t2_3 = t2[3];
    t2_4 = t2[4];
    t2_5 = t2[5];

    dest[0] = t1_0*t2_0 + t1_1*t2_3;
    dest[1] = t1_0*t2_1 + t1_1*t2_4;
    dest[2] = t1_0*t2_2 + t1_1*t2_5 + t1_2;

    dest[3] = t1_3*t2_0 + t1_4*t2_3;
    dest[4] = t1_3*t2_1 + t1_4*t2_4;
    dest[5] = t1_3*t2_2 + t1_4*t2_5 + t1_5;

    return dest;
  };

  /**
   * Multiplica esta transformación con otra, combinándolas.
   * Modifica esta transformación y regresa.
   * @method mult
   * @param {p5.Transform2D|Float32Array|Array.<number>} other - otro
   * @return {p5.Transform2D}
   */
  p5.Transform2D.prototype.mult = function(other) {
    return p5.Transform2D.mult(this, other, this);
  };

  /**
   * Modifica esta transformación, tranduciéndola por una cierta cantidad.
   * Regresa esta transformación.
   * @method traduce
   * @return {p5.Transform2D}
   * @example
   *     // Dos formas diferentes de llamar a este método.
   *     var t = new p5.Transform();
   *     // 1. Dos números
   *     t.translate(x, y);
   *     // 2. Un vector
   *     t.translate(new p5.Vector(x, y));
   */
  p5.Transform2D.prototype.translate = function(arg0, arg1) {
    var x, y;
    if (arg0 instanceof p5.Vector) {
      x = arg0.x;
      y = arg0.y;
    } else if (typeof arg0 === 'number' && typeof arg1 === 'number') {
      x = arg0;
      y = arg1;
    } else {
      var args = '';
      for (var i = 0; i < arguments.length; i++) {
        args += arguments[i] + ', ';
      }
      throw new TypeError('Argumentos inválidos para Transform2D.translate: ' + args);
    }
    return p5.Transform2D.mult([
      1, 0, x,
      0, 1, y
    ], this, this);
  };

  /**
   * Recupera la traducción resuelta de esta transformación.
   * @method getTranslation
   * @return {p5.Vector}
   */
  p5.Transform2D.prototype.getTranslation = function() {
    return new p5.Vector(this[2], this[5]);
  };

  /**
   * Modifica esta transformación, escalandolo por una cierta cantidad.
   * Regresa esta transformación.
   * @method escala
   * @return {p5.Transform2D}
   * @example
   *     // Tres formas diferentes de llamar a este método.
   *     var t = new p5.Transform();
   *     // 1. Un valor escalar
   *     t.scale(uniformScale);
   *     // 1. Dos valores escalares
   *     t.scale(scaleX, scaleY);
   *     // 2. Un vector 
   *     t.translate(new p5.Vector(scaleX, scaleY));
   */
  p5.Transform2D.prototype.scale = function(arg0, arg1) {
    var sx, sy;
    if (arg0 instanceof p5.Vector) {
      sx = arg0.x;
      sy = arg0.y;
    } else if (typeof arg0 === 'number' && typeof arg1 === 'number') {
      sx = arg0;
      sy = arg1;
    } else if (typeof arg0 === 'number') {
      sx = arg0;
      sy = arg0;
    } else {
      throw new TypeError('Argumentos inválidos para  Transform2D.scale: ' + arguments);
    }
    return p5.Transform2D.mult([
      sx, 0, 0,
      0, sy, 0
    ], this, this);
  };

  /**
   * Recupera el vector de escala de esta transformación.
   * @method getScale
   * @return {p5.Vector}
   */
  p5.Transform2D.prototype.getScale = function() {
    var a = this[0], b = this[1],
        c = this[3], d = this[4];
    return new p5.Vector(
      sign(a) * Math.sqrt(a*a + b*b),
      sign(d) * Math.sqrt(c*c + d*d)
    );
  };

  /*
   * Devuelve -1, 0 o 1 dependiendo de si un número es negativo, cero o positivo.
   */
  function sign(x) {
    x = +x; // convierte a un número
    if (x === 0 || isNaN(x)) {
      return Number(x);
    }
    return x > 0 ? 1 : -1;
  }

  /**
   * Modifica esta transformación, rotándolo por una cierta cantidad.
   * @method rotate - rotar
   * @param {number} radianes
   * @return {p5.Transform2D}
   */
  p5.Transform2D.prototype.rotate = function(radians) {
    // Clockwise!
    if (typeof radians !== 'number') {
      throw new TypeError('Argumentos inválidos para Transform2D.rotate: ' + arguments);
    }
    var sinR = Math.sin(radians);
    var cosR = Math.cos(radians);
    return p5.Transform2D.mult([
      cosR, -sinR, 0,
      sinR, cosR, 0
    ], this, this);
  };

  /**
   * Recupera el ángulo de esta transformación en radianes.
   * @method getRotation
   * @return {number}
   */
  p5.Transform2D.prototype.getRotation = function() {
    // ver http://math.stackexchange.com/a/13165
    return Math.atan2(-this[1], this[0]);
  };

  /**
   * Applica una matriz de transformación 2D (utilizando coordenadas homogéneas, como 3x3)
   * a un Vector2 (<x, y, 1>) y regresa a un nuevo vector2.
   * @method transform
   * @for p5.Vector
   * @static
   * @param {p5.Vector} v
   * @param {p5.Transform2D} t
   * @return {p5.Vector} un vector nuevo
   */
  p5.Vector.transform = function(v, t) {
    return v.copy().transform(t);
  };

  /**
   * Transforma este vector por una matriz de transformación 2D.
   * @method transform
   * @for p5.Vector
   * @param {p5.Transform2D} transforma
   * @return {p5.Vector} esto, después del cambio
   */
  p5.Vector.prototype.transform = function(transform) {
    // Nota: ¡Aquí hacemos muchas trampas ya que esto solo es 2D!
    // Utiliza un método diferente si buscas una verdadera multiplicación de matriz.
    var x = this.x;
    var y = this.y;
    this.x = transform[0]*x + transform[1]*y + transform[2];
    this.y = transform[3]*x + transform[4]*y + transform[5];
    return this;
  };

}));
